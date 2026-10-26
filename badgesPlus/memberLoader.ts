/*
 * BadgesPlus, a Vencord userplugin
 * Copyright (c) 2026 lirenzzzin
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { Logger } from "@utils/Logger";
import { findByPropsLazy } from "@webpack";
import { FluxDispatcher, GuildMemberCountStore, GuildMemberStore } from "@webpack/common";

const logger = new Logger("BadgesPlus");
const GuildActions = findByPropsLazy("requestMembers", "requestMembersById") as {
    requestMembers?: (guildId: string, query?: string, limit?: number, includePresences?: boolean) => void;
} | undefined;

const MEMBERS_SELECTOR = 'div[class*="members_"]';
const MAX_MS = 20 * 60 * 1000; // teto de tempo por varredura / per-scan time cap
const ZERO_GROWTH_PASSES = 2; // voltas sem gente nova antes de parar / empty passes before stopping
const PLATEAU_MIN_GROWTH = 40; // abaixo disso a lista já saturou / below this the list has plateaued

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export interface MemberScanProgress {
    loaded: number;
    total: number;
    done: boolean;
    cancelled: boolean;
}

export interface MemberScanController {
    cancelled: boolean;
    cancel(): void;
}

export interface MemberScanOptions {
    /** Teto de espera por cada faixa nova da lista / max wait per new list range */
    maxStepWaitMs?: number;
}

const activeScans = new Set<MemberScanController>();
const activeGuildScans = new Map<string, MemberScanController>();

export function cancelAllMemberScans() {
    for (const scan of activeScans) scan.cancel();
}

export function isScanningGuild(guildId: string) {
    return activeGuildScans.has(guildId);
}

export function loadedMemberCount(guildId: string) {
    return GuildMemberStore.getMemberIds(guildId).length;
}

// Busca no servidor inteiro pelo gateway (op 8), uma por vez e com intervalo.
// O BFS antigo saturava; aqui é só uma consulta por vez, disparada pelo filtro.
// Server-wide search via gateway (op 8), one at a time with a gap. The old BFS saturated;
// this is a single query at a time, triggered by the filter.
const SEARCH_GAP_MS = 2500;
let searchChain: Promise<void> = Promise.resolve();
let lastSearchAt = 0;

function requestMembersPage(guildId: string, query: string, limit = 100) {
    try {
        if (GuildActions?.requestMembers) {
            GuildActions.requestMembers(guildId, query, limit, false);
            return;
        }

        FluxDispatcher.dispatch({
            type: "GUILD_MEMBERS_REQUEST",
            guildId,
            guildIds: [guildId],
            query,
            limit,
            presences: false
        });
    } catch (e) {
        logger.error("Falha na busca de membros / member search failed", e);
    }
}

export function searchGuildMembers(guildId: string, query: string, limit = 100): Promise<void> {
    const q = query.trim();
    if (q.length < 2) return Promise.resolve();

    searchChain = searchChain.then(async () => {
        const wait = SEARCH_GAP_MS - (Date.now() - lastSearchAt);
        if (wait > 0) await sleep(wait);
        lastSearchAt = Date.now();
        requestMembersPage(guildId, q, limit);
    }).catch(() => { });

    return searchChain;
}

// A lista de membros para de carregar por volta de ~2.400 membros (limite do próprio cliente).
// A varredura profunda usa a busca do gateway (op 8) por prefixo: uma consulta por vez, com pausa,
// cobrindo 1 e 2 caracteres. É lenta, mas é o que passa do teto da lista.
// The member list stops around ~2,400 members (the client's own cap). The deep scan uses the
// gateway search (op 8) by prefix: one query at a time with a gap, covering 1 and 2 characters.
// It's slow, but it's what gets past the list cap.
const DEEP_CHARS = [..."abcdefghijklmnopqrstuvwxyz0123456789._"];
const DEEP_GAP_MS = 800;
const DEEP_MAX_MS = 40 * 60 * 1000;
const DEEP_KEY = "BadgesPlus:deepScan:v1:";
const DEEP_SAVE_EVERY = 20;

export interface DeepScanOptions {
    /** Intervalo entre consultas de prefixo / gap between prefix queries */
    gapMs?: number;
}

interface DeepScanState {
    nextIndex: number;
}

function deepKey(guildId: string) {
    return `${DEEP_KEY}${guildId}`;
}

async function loadDeepIndex(guildId: string, length: number) {
    try {
        const state = await DataStore.get<DeepScanState>(deepKey(guildId));
        if (state && Number.isInteger(state.nextIndex) && state.nextIndex > 0 && state.nextIndex < length) {
            return state.nextIndex;
        }
    } catch { /* começa do zero / start over */ }
    return 0;
}

function saveDeepIndex(guildId: string, nextIndex: number, length: number) {
    const key = deepKey(guildId);
    if (nextIndex >= length) {
        void DataStore.del(key).catch(() => { });
        return;
    }
    void DataStore.set(key, { nextIndex } satisfies DeepScanState).catch(() => { });
}

let deepPrefixesCache: string[] | undefined;
function deepPrefixes() {
    if (deepPrefixesCache) return deepPrefixesCache;

    const prefixes = [...DEEP_CHARS];
    for (const first of DEEP_CHARS) {
        for (const second of DEEP_CHARS) {
            prefixes.push(first + second);
        }
    }

    deepPrefixesCache = prefixes;
    return prefixes;
}

/**
 * Enumera os membros pelo gateway por prefixo. Uma consulta retorna até 100 membros; como a
 * distribuição de nomes é espalhada, 1 e 2 letras cobrem a maior parte do servidor.
 * Enumerates members through the gateway by prefix. One query returns up to 100 members; names
 * are spread out, so 1 and 2 characters cover most of the server.
 */
export function deepScanMembers(
    guildId: string,
    onProgress: (progress: MemberScanProgress) => void,
    options: DeepScanOptions = {}
): MemberScanController {
    const existing = activeGuildScans.get(guildId);
    if (existing) return existing;

    const controller: MemberScanController = {
        cancelled: false,
        cancel() { controller.cancelled = true; }
    };
    activeScans.add(controller);
    activeGuildScans.set(guildId, controller);

    const total = (() => {
        try { return GuildMemberCountStore?.getMemberCount(guildId) ?? 0; } catch { return 0; }
    })();

    let loaded = loadedMemberCount(guildId);
    let lastEmit = 0;

    const emit = (done: boolean) => {
        const now = Date.now();
        if (!done && now - lastEmit < 200) return;
        lastEmit = now;
        onProgress({ loaded, total, done, cancelled: controller.cancelled });
    };

    const refresh = () => {
        const next = loadedMemberCount(guildId);
        if (next > loaded) loaded = next;
    };

    void (async () => {
        const gap = Math.max(300, options.gapMs ?? DEEP_GAP_MS);
        const startedAt = Date.now();

        try {
            const prefixes = deepPrefixes();
            let index = await loadDeepIndex(guildId, prefixes.length);

            for (; index < prefixes.length; index++) {
                if (controller.cancelled || Date.now() - startedAt > DEEP_MAX_MS) break;
                if (total && loaded >= total) break;

                requestMembersPage(guildId, prefixes[index], 100);
                await sleep(gap);
                refresh();
                emit(false);

                if ((index + 1) % DEEP_SAVE_EVERY === 0) {
                    saveDeepIndex(guildId, index + 1, prefixes.length);
                }
            }

            const completed = index >= prefixes.length || (total > 0 && loaded >= total);
            saveDeepIndex(guildId, completed ? prefixes.length : index, prefixes.length);

            logger.info(`Varredura profunda: ${loaded}/${total} (${completed ? "completa" : `parou em ${index}`})`);
            emit(true);
        } finally {
            activeScans.delete(controller);
            if (activeGuildScans.get(guildId) === controller) activeGuildScans.delete(guildId);
        }
    })();

    return controller;
}

// A lista de membros do Discord carrega em FAIXAS conforme você rola (é o mesmo mecanismo do
// cliente, então não passa pelo rate limit da API). A busca do gateway (op 8) saturava e ainda
// ajudava a tomar limite — por isso a varredura agora é só a rolagem.
// Discord's member list loads in RANGES as you scroll (the client's own mechanism, so it doesn't go
// through the API rate limit). The gateway search (op 8) saturated and even helped hit the limit —
// so the scan is now scroll-only.

function getMemberListEl(): HTMLElement | null {
    const el = document.querySelector(MEMBERS_SELECTOR);
    return el instanceof HTMLElement && el.scrollHeight > el.clientHeight ? el : null;
}

function ensureMemberListOpen() {
    if (getMemberListEl()) return;
    const btn = document.querySelector(
        '[aria-label="Show Member List"], [aria-label="Mostrar lista de membros"], [aria-label*="Member List"], [aria-label*="lista de membros"]'
    );
    if (btn instanceof HTMLElement) btn.click();
}

/**
 * Carrega o máximo de membros varrendo a lista de membros de cima a baixo. Para sozinho quando uma
 * volta inteira não traz gente nova, e o botão Parar interrompe na hora.
 * Loads as many members as possible by sweeping the member list top to bottom. It stops on its own
 * when a full pass brings nobody new, and the Stop button halts it immediately.
 */
export function scanGuildMembers(
    guildId: string,
    onProgress: (progress: MemberScanProgress) => void,
    options: MemberScanOptions = {}
): MemberScanController {
    const existing = activeGuildScans.get(guildId);
    if (existing) return existing;

    const controller: MemberScanController = {
        cancelled: false,
        cancel() { controller.cancelled = true; }
    };
    activeScans.add(controller);
    activeGuildScans.set(guildId, controller);

    const total = (() => {
        try { return GuildMemberCountStore?.getMemberCount(guildId) ?? 0; } catch { return 0; }
    })();

    let loaded = loadedMemberCount(guildId);
    let lastEmit = 0;

    const emit = (done: boolean) => {
        const now = Date.now();
        if (!done && now - lastEmit < 200) return;
        lastEmit = now;
        onProgress({ loaded, total, done, cancelled: controller.cancelled });
    };

    const refresh = () => {
        const next = loadedMemberCount(guildId);
        if (next > loaded) loaded = next;
    };

    const onChunk = () => { refresh(); emit(false); };
    FluxDispatcher.subscribe("GUILD_MEMBERS_CHUNK", onChunk);
    FluxDispatcher.subscribe("GUILD_MEMBERS_CHUNK_BATCH", onChunk);

    void (async () => {
        const startedAt = Date.now();
        const maxStepWait = Math.max(150, options.maxStepWaitMs ?? 1200);
        let pos = 0;
        let emptyPasses = 0;
        let lastCount = loaded;

        try {
            ensureMemberListOpen();
            await sleep(700);

            while (!controller.cancelled && Date.now() - startedAt < MAX_MS) {
                if (total && loaded >= total) break;

                const el = getMemberListEl();
                if (!el) {
                    ensureMemberListOpen();
                    await sleep(500);
                    refresh();
                    emit(false);
                    continue;
                }

                const max = el.scrollHeight - el.clientHeight;
                const before = el.scrollHeight;
                el.scrollTop = Math.min(pos, max);

                // Espera a próxima faixa carregar (a lista cresce) em vez de dormir um tempo fixo.
                // Isso carrega mais rápido quando a rede responde e evita desperdício quando não.
                // Waits for the next range to load (the list grows) instead of a fixed sleep. That's
                // faster when the network responds and avoids waste when it doesn't.
                const waitStart = Date.now();
                while (!controller.cancelled && Date.now() - waitStart < maxStepWait) {
                    await sleep(Math.min(90, maxStepWait));
                    if (el.scrollHeight > before) break;
                }

                refresh();
                emit(false);

                pos += Math.max(120, Math.floor(el.clientHeight * 0.75));

                if (pos > max) {
                    // deu a volta: a lista chegou no fim / reached the end, looping back
                    pos = 0;
                    const grew = loaded - lastCount;
                    lastCount = loaded;
                    if (grew < PLATEAU_MIN_GROWTH) {
                        if (++emptyPasses >= ZERO_GROWTH_PASSES) break;
                    } else {
                        emptyPasses = 0;
                    }
                }
            }

            logger.info(`Varredura de membros: ${loaded}/${total}`);
            emit(true);
        } finally {
            FluxDispatcher.unsubscribe("GUILD_MEMBERS_CHUNK", onChunk);
            FluxDispatcher.unsubscribe("GUILD_MEMBERS_CHUNK_BATCH", onChunk);
            activeScans.delete(controller);
            if (activeGuildScans.get(guildId) === controller) activeGuildScans.delete(guildId);
        }
    })();

    return controller;
}
