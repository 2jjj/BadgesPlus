/*
 * BadgesPlus, a Vencord userplugin
 * Copyright (c) 2026 lirenzzzin
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { fetchUserProfile } from "@utils/discord";
import { Logger } from "@utils/Logger";
import { FluxDispatcher, UserProfileStore } from "@webpack/common";

// Fila única de busca de perfis, usada pelas badges ao lado do nome e pelo pesquisador.
// Single profile fetch queue, shared by the name badges and the badge search.
//
// Velocidade adaptativa: começa no intervalo mínimo das configurações; se o Discord
// responder 429, espera o tempo pedido e desacelera. Após vários sucessos, acelera de novo.
// Adaptive speed: starts at the minimum interval from settings; on a 429 it waits as
// requested and slows down. After a streak of successes it speeds up again.

const logger = new Logger("BadgesPlus");

const MAX_DELAY = 5000;
const SPEEDUP_AFTER = 15;

const queue: string[] = [];
const queued = new Set<string>();
const failed = new Set<string>();
const listeners = new Set<() => void>();

let minDelay = 500;
let delay = minDelay;
let streak = 0;
let running = false;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const notify = () => listeners.forEach(l => l());

export function setMinDelay(ms: number) {
    minDelay = ms;
    delay = Math.max(delay, ms);
}

/** Perfil já carregado ou falhou (ex.: conta apagada) / Profile already loaded or failed (e.g. deleted account) */
export const isDone = (id: string) => failed.has(id) || !!UserProfileStore.getUserProfile(id);

export const pendingCount = () => queue.length;

export function onQueueChange(listener: () => void) {
    listeners.add(listener);
    return () => void listeners.delete(listener);
}

/**
 * Coloca perfis na fila / Queues profiles.
 * @param front true = passa na frente (quem está na tela) / jumps the queue (who is on screen)
 */
export function queueProfiles(ids: string[], front = false) {
    for (const id of ids) {
        if (isDone(id)) continue;
        if (queued.has(id)) {
            if (!front) continue;
            queue.splice(queue.indexOf(id), 1);
        }
        queued.add(id);
        front ? queue.unshift(id) : queue.push(id);
    }

    notify();
    if (!running) void run();
}

export function clearQueue() {
    queue.length = 0;
    queued.clear();
    notify();
}

async function run() {
    running = true;
    try {
        while (queue.length) {
            const id = queue.shift()!;
            queued.delete(id);
            if (isDone(id)) continue;

            try {
                await fetchUserProfile(id);
                if (++streak >= SPEEDUP_AFTER) {
                    streak = 0;
                    delay = Math.max(minDelay, Math.round(delay * 0.8));
                }
            } catch (e: any) {
                // evita o Discord achar que ainda está carregando / so Discord doesn't think it's still loading
                FluxDispatcher.dispatch({ type: "USER_PROFILE_FETCH_FAILURE", userId: id });
                streak = 0;

                if (e?.status === 429) {
                    const retryAfter = Number(e?.body?.retry_after) || 5;
                    delay = Math.min(MAX_DELAY, Math.round(delay * 1.5) + 250);
                    logger.warn(`Rate limited: waiting ${retryAfter}s, new interval ${delay}ms`);
                    queued.add(id);
                    queue.unshift(id);
                    notify();
                    await sleep(retryAfter * 1000);
                    continue;
                }

                failed.add(id);
            }

            notify();
            await sleep(delay);
        }
    } finally {
        running = false;
        notify();
    }
}
