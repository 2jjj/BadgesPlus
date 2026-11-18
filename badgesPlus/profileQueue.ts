/*
 * BadgesPlus, a Vencord userplugin
 * Copyright (c) 2026 lirenzzzin
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { Logger } from "@utils/Logger";
import { Constants, FluxDispatcher, RestAPI, UserProfileStore } from "@webpack/common";

import { hasCachedBadges, setCachedBadges } from "./badgeCache";
import type { SimpleBadge } from "./badges";

const COOLDOWN_KEY = "BadgesPlus:cooldownUntil:v1";

// Fila de busca de perfis, usada pelas badges ao lado do nome e pelo pesquisador.
// Profile fetch queue, shared by the name badges and the badge search.
//
// Roda vários fetches em paralelo (concorrência das configurações) para ir bem mais rápido,
// mas com freio adaptativo: se o Discord responder 429, pausa todo mundo pelo tempo pedido,
// aumenta o intervalo e volta a acelerar depois de uma sequência de sucessos.
// Runs several fetches in parallel (concurrency from settings) to go much faster, with an
// adaptive brake: on a 429 it pauses everyone for the requested time, grows the interval and
// speeds up again after a streak of successes.

const logger = new Logger("BadgesPlus");

const MAX_DELAY = 6000;
const MAX_CONCURRENCY = 8;
const SPEEDUP_AFTER = 8;

const queue: string[] = [];
const queued = new Set<string>();
const inFlight = new Set<string>();
const failed = new Map<string, number>();
const permanentFailed = new Set<string>();
const retries = new Map<string, number>();
const listeners = new Set<() => void>();

// Falha passageira (rede, 429, 5xx) não é sentença de morte: o perfil volta pra fila sozinho
// depois desse tempo. Só 403/404 (conta inexistente/sem acesso) ficam de fora até um retry manual.
// A transient failure (network, 429, 5xx) isn't final: the profile rejoins the queue by itself
// after this time. Only 403/404 (missing account/no access) stay out until a manual retry.
const FAIL_RETRY_MS = 5 * 60 * 1000;

let minDelay = 500;
let maxConcurrency = 2;
let delay = minDelay;
let streak = 0;
let running = false;
let pausedUntil = 0;
let okCount = 0;
let consecutive429 = 0;
let successesSince429 = 0;

// Se o Discord mandar 429, cada vez espaçamos mais (10s, 20s, 40s... até 5min). Insistir a cada
// poucos segundos, quando a conta está em limite GLOBAL, só mantém o limite vivo — e aí NADA carrega.
// On a 429 we space it out more each time (10s, 20s, 40s... up to 5min). Retrying every few seconds
// while the account is in a GLOBAL limit only keeps the limit alive — and then NOTHING loads.
const MAX_BACKOFF = 300000;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const notify = () => listeners.forEach(l => l());

export function setMinDelay(ms: number) {
    const value = Number(ms);
    if (!Number.isFinite(value) || value <= 0) return;
    minDelay = value;
    delay = Math.max(delay, value);
}

export function setConcurrency(n: number) {
    const value = Math.round(Number(n));
    if (!Number.isFinite(value)) return;
    maxConcurrency = Math.max(1, Math.min(MAX_CONCURRENCY, value));
}

/**
 * Lê o cooldown salvo no disco. Sem isso, toda vez que o app reinicia ele já volta martelando o
 * Discord e o limite nunca libera. / Reads the cooldown saved on disk. Without it, every app restart
 * immediately hammers Discord again and the limit never clears.
 */
export async function initCooldown() {
    try {
        const until = await DataStore.get<number>(COOLDOWN_KEY);
        if (typeof until === "number" && until > Date.now()) {
            pausedUntil = Math.max(pausedUntil, until);
            logger.warn(`Conta ainda em cooldown até ${new Date(until).toLocaleTimeString()} / account still cooling down until then`);
        }
    } catch { /* ignore */ }
}

function setCooldown(until: number) {
    pausedUntil = Math.max(pausedUntil, until);
    void DataStore.set(COOLDOWN_KEY, until).catch(() => { });
}

/**
 * Só considera pronto quando as badges realmente existem: perfil presente sem `badges` (objeto
 * parcial que o cliente às vezes guarda) continua precisando de busca. Antes ele era tratado como
 * "já carregado" e nunca recebia Nitro/impulso — era a badge que faltava na lista.
 * Only considers it done when badges actually exist: a profile present without `badges` (a partial
 * object the client sometimes keeps) still needs a fetch. Before, it was treated as "already
 * loaded" and never got Nitro/boost — that was the badge missing from the list.
 */
const profileHasBadges = (id: string) => {
    const badges = (UserProfileStore.getUserProfile(id) as any)?.badges;
    return Array.isArray(badges);
};

export const isDone = (id: string) => {
    if (hasCachedBadges(id) || profileHasBadges(id)) return true;
    if (permanentFailed.has(id)) return true;

    const failedAt = failed.get(id);
    return failedAt != null && Date.now() - failedAt < FAIL_RETRY_MS;
};

export const pendingCount = () => queue.length + bulkQueue.length;

/** Estatísticas pra interface / stats for the UI */
export function getQueueStats() {
    return {
        pending: queue.length,
        ok: okCount,
        failed: failed.size + permanentFailed.size,
        pausedMs: Math.max(0, pausedUntil - Date.now())
    };
}

/** Libera quem falhou pra tentar de novo / lets failed profiles be tried again */
export function retryFailed(): string[] {
    if (!failed.size && !permanentFailed.size) return [];
    const ids = new Set([...failed.keys(), ...permanentFailed]);
    failed.clear();
    permanentFailed.clear();
    retries.clear();
    notify();
    return [...ids];
}

export function onQueueChange(listener: () => void) {
    listeners.add(listener);
    return () => void listeners.delete(listener);
}

/**
 * Busca o perfil direto na API, sem passar pelo `fetchUserProfile` do Vencord. Aquele helper
 * devolve o perfil que já está na store mesmo quando ele veio sem `badges` (objeto parcial) — e aí
 * o perfil nunca era buscado de verdade. Aqui a requisição sempre acontece e as badges vêm da
 * própria resposta. / Fetches the profile straight from the API instead of Vencord's
 * `fetchUserProfile`. That helper returns the profile already in the store even when it came
 * without `badges` (partial object) — so the profile was never actually fetched. Here the request
 * always happens and badges come from the response itself.
 */
async function fetchProfileBadges(id: string): Promise<SimpleBadge[]> {
    FluxDispatcher.dispatch({ type: "USER_PROFILE_FETCH_START", userId: id });

    const { body } = await RestAPI.get({
        url: Constants.Endpoints.USER_PROFILE(id),
        query: {
            with_mutual_guilds: false,
            with_mutual_friends_count: false
        },
        oldFormErrors: true
    });

    FluxDispatcher.dispatch({ type: "USER_UPDATE", user: body.user });
    await FluxDispatcher.dispatch({ type: "USER_PROFILE_FETCH_SUCCESS", userProfile: body });

    return Array.isArray(body.badges) ? body.badges : [];
}

/**
 * Coloca perfis na fila / Queues profiles.
 * @param front true = passa na frente (quem está na tela) / jumps the queue (who is on screen)
 */
export function queueProfiles(ids: string[], front = false) {
    for (const id of ids) {
        // já carregado, falhou, ou está buscando agora: não duplica a requisição
        // already loaded, failed, or fetching right now: don't duplicate the request
        if (isDone(id) || inFlight.has(id)) continue;
        if (queued.has(id)) {
            if (!front) continue;
            const index = queue.indexOf(id);
            if (index !== -1) queue.splice(index, 1);
        }
        queued.add(id);
        front ? queue.unshift(id) : queue.push(id);
    }

    notify();
    if (!running) pump();
}

export function clearQueue() {
    queue.length = 0;
    queued.clear();
    clearBulkLoader();
    notify();
}

// ---- Carga em segundo plano (devagar e segura) / background load (slow & safe) ----------------
// Uma fila separada e sequencial pra carregar o servidor inteiro sem martelar o Discord:
// um perfil por vez, com intervalo configurável, back total na 429 e cooldown compartilhado.
// O progresso persiste sozinho no cache de badges; quem já tem badge pula, quem falta entra.
// A separate sequential queue to load the whole server without hammering Discord:
// one profile at a time, configurable interval, full backoff on 429 and a shared cooldown.
// Progress persists by itself in the badge cache; whoever has badges is skipped, the rest join.
const bulkQueue: string[] = [];
const bulkQueued = new Set<string>();
let bulkTimer: ReturnType<typeof setTimeout> | undefined;
let bulkDelayMs = 2500;

export function setBulkDelay(ms: number) {
    const value = Number(ms);
    if (!Number.isFinite(value)) return;
    bulkDelayMs = Math.max(1000, Math.min(15000, Math.round(value)));
}

/** Enfileira ids pra carga de fundo / queues ids for background loading */
export function queueBulkProfiles(ids: string[]) {
    for (const id of ids) {
        if (isDone(id) || inFlight.has(id) || queued.has(id) || bulkQueued.has(id)) continue;
        bulkQueued.add(id);
        bulkQueue.push(id);
    }

    if (bulkQueue.length) scheduleBulk();
}

export function clearBulkLoader() {
    bulkQueue.length = 0;
    bulkQueued.clear();

    if (bulkTimer != null) {
        clearTimeout(bulkTimer);
        bulkTimer = undefined;
    }
}

export const bulkPendingCount = () => bulkQueue.length;

function scheduleBulk(afterMs?: number) {
    if (bulkTimer != null) return;
    bulkTimer = setTimeout(() => void bulkTick(), afterMs ?? bulkDelayMs);
}

function enqueueBulkAgain(id: string) {
    bulkQueued.add(id);
    bulkQueue.push(id);
}

async function bulkTick() {
    bulkTimer = undefined;
    if (!bulkQueue.length) return;

    const pause = pausedUntil - Date.now();
    if (pause > 0) {
        // o limite pediu: respeita e volta depois, com folga / the limit asked: respect it and come back later, with slack
        scheduleBulk(pause + 1000 + Math.random() * 1000);
        return;
    }

    const id = bulkQueue.shift()!;
    bulkQueued.delete(id);
    if (isDone(id) || inFlight.has(id)) {
        scheduleBulk();
        return;
    }

    inFlight.add(id);
    const result = await tryProfileFetch(id, true);

    if (result === "ratelimited") {
        enqueueBulkAgain(id);
        scheduleBulk(Math.max(5000, pausedUntil - Date.now() + 1000));
        return;
    }

    if (result === "retry") enqueueBulkAgain(id);

    scheduleBulk(bulkDelayMs + Math.random() * 800);
}

function pump() {
    if (running || !queue.length) {
        running = false;
        notify();
        return;
    }

    running = true;
    let finished = 0;
    const total = Math.max(1, maxConcurrency);

    for (let i = 0; i < total; i++) {
        void worker().finally(() => {
            if (++finished < total) return;
            running = false;
            // itens podem ter entrado enquanto os workers terminavam / items may have been
            // queued while the workers were finishing
            if (queue.length) pump();
            else notify();
        });
    }
}

async function tryProfileFetch(id: string, bulk: boolean): Promise<"ok" | "ratelimited" | "retry" | "failed"> {
    try {
        const badges = await fetchProfileBadges(id);
        // guarda no cache persistente pra não recomeçar do topo depois
        // store in the persistent cache so it doesn't start over from the top later
        setCachedBadges(id, badges);
        inFlight.delete(id);
        retries.delete(id);
        failed.delete(id);
        permanentFailed.delete(id);
        okCount++;
        // só zera o backoff depois de uma sequência de sucessos; um sucesso isolado
        // entre 429s não pode derrubar o freio de novo.
        // only clear the backoff after a streak of successes; a single success between
        // 429s must not reset the brake again.
        successesSince429++;
        if (successesSince429 >= SPEEDUP_AFTER) {
            consecutive429 = 0;
            successesSince429 = 0;
        }
        if (++streak >= SPEEDUP_AFTER) {
            streak = 0;
            delay = Math.max(minDelay, Math.round(delay * 0.8));
        }

        return "ok";
    } catch (e: any) {
        // evita o Discord achar que ainda está carregando / so Discord doesn't think it's still loading
        FluxDispatcher.dispatch({ type: "USER_PROFILE_FETCH_FAILURE", userId: id });
        inFlight.delete(id);
        streak = 0;

        if (e?.status === 429) {
            // Backoff exponencial, com piso no retry_after que o Discord mandar.
            // Exponential backoff, floored by Discord's retry_after.
            successesSince429 = 0;
            consecutive429++;
            const expMs = Math.min(MAX_BACKOFF, 10000 * 2 ** Math.min(consecutive429 - 1, 5));
            const retryMs = (Number(e?.body?.retry_after) || 0) * 1000;
            const waitMs = Math.max(expMs, retryMs);

            delay = Math.min(MAX_DELAY, Math.round(delay * 1.25) + 150);
            if (bulk) bulkDelayMs = Math.min(15000, Math.max(bulkDelayMs, Math.round(bulkDelayMs * 1.5) + 500));
            setCooldown(Date.now() + waitMs);
            logger.warn(`Rate limited: esperando ${Math.round(waitMs / 1000)}s (429 seguidos: ${consecutive429})`);

            return "ratelimited";
        }

        const status = Number(e?.status) || 0;
        const transient = !status || status === 408 || status >= 500;
        const attempts = retries.get(id) ?? 0;

        if (transient && attempts < 2) {
            // erro de rede/5xx costuma passar na segunda tentativa; 404/403 não.
            // network/5xx errors usually clear on a retry; 404/403 don't.
            retries.set(id, attempts + 1);
            await sleep(1500 + attempts * 1000);
            return "retry";
        }

        // 403/404: a conta não existe ou não dá pra ver o perfil; insistir não adianta.
        // Qualquer outra falha volta sozinha depois de FAIL_RETRY_MS (o perfil continua
        // aparecendo na lista e é reenfileirado quando a linha renderiza de novo).
        // 403/404: the account doesn't exist or the profile isn't visible; retrying won't help.
        // Any other failure returns by itself after FAIL_RETRY_MS (the profile stays visible in
        // the list and is re-queued when the row renders again).
        if (status === 403 || status === 404) permanentFailed.add(id);
        failed.set(id, Date.now());
        return "failed";
    }
}

async function worker() {
    while (queue.length) {
        const id = queue.shift()!;
        queued.delete(id);
        if (isDone(id)) continue;
        inFlight.add(id);

        const wait = pausedUntil - Date.now();
        // jitter no fim do cooldown: os workers não voltam todos no mesmo instante
        // jitter after the cooldown: workers don't all come back at the exact same moment
        if (wait > 0) await sleep(wait + Math.random() * 750);

        const result = await tryProfileFetch(id, false);

        if (result === "ratelimited" || result === "retry") {
            // devolve pro FIM da fila: não ficar churnando as mesmas contas na frente.
            // O wait de verdade acontece no topo do loop, sem dormir duas vezes.
            // back of the line: don't churn the same accounts at the front.
            // The actual wait happens at the loop top, so we don't sleep twice.
            queued.add(id);
            queue.push(id);
            notify();
            continue;
        }

        notify();
        // jitter evita que todos os workers batam no mesmo instante / jitter keeps the workers
        // from hitting Discord at the exact same time
        await sleep(delay + Math.random() * 120);
    }
}
