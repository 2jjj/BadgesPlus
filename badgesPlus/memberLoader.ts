/*
 * BadgesPlus, a Vencord userplugin
 * Copyright (c) 2026 lirenzzzin
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import { findByPropsLazy } from "@webpack";
import { FluxDispatcher, GuildMemberCountStore, GuildMemberStore } from "@webpack/common";

const logger = new Logger("BadgesPlus");

// Módulo nativo de pedido de membros (o mesmo que a lista de membros usa). É o caminho que
// comprovadamente funciona pra puxar membros além dos ~100 iniciais.
// Native member-request module (the same one the member list uses). It's the path that provably
// works to pull members beyond the initial ~100.
const GuildActions = findByPropsLazy("requestMembers", "requestMembersById") as {
    requestMembers?: (guildId: string, query?: string, limit?: number, includePresences?: boolean) => void;
} | undefined;

const CHARS = "abcdefghijklmnopqrstuvwxyz0123456789._-";
const PAGE = 100;
const MAX_DEPTH = 3;
const REQUEST_BUDGET = 9000;
const CONCURRENCY = 6;
const STEP_MS = 90; // intervalo entre despachos / gap between dispatches
const SETTLE_MS = 900; // espera os chunks do nível chegarem / wait for the level's chunks

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

const activeScans = new Set<MemberScanController>();

export function cancelAllMemberScans() {
    for (const scan of activeScans) scan.cancel();
}

export function loadedMemberCount(guildId: string) {
    return GuildMemberStore.getMemberIds(guildId).length;
}

/**
 * Puxa membros do gateway (op 8) em níveis de busca por trecho do nome: 1 letra, depois 2, depois 3.
 *
 * IMPORTANTE: o Discord manda os chunks de membro no evento em lote SEM o nonce, então não dá pra
 * saber por requisição se a página encheu. Por isso expandimos TODOS os nós um nível (BFS) e medimos
 * o quanto AQUELE NÍVEL inteiro cresceu: enquanto um nível trouxer gente nova, descemos mais.
 *
 * Pulls members from the gateway (op 8) in levels of substring search: 1 char, then 2, then 3.
 *
 * IMPORTANT: Discord sends member chunks in the batch event WITHOUT the nonce, so we can't tell per
 * request whether the page filled up. So we expand EVERY node one level (BFS) and measure how much
 * that WHOLE LEVEL grew: as long as a level brings new people, we go deeper.
 */
export function scanGuildMembers(
    guildId: string,
    onProgress: (progress: MemberScanProgress) => void,
    gap = 300
): MemberScanController {
    const controller: MemberScanController = {
        cancelled: false,
        cancel() { controller.cancelled = true; }
    };
    activeScans.add(controller);

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

    const request = (query: string) => {
        try {
            if (GuildActions?.requestMembers) {
                GuildActions.requestMembers(guildId, query, PAGE, false);
                return;
            }
            FluxDispatcher.dispatch({
                type: "GUILD_MEMBERS_REQUEST",
                guildId,
                guildIds: [guildId],
                query,
                limit: PAGE,
                presences: false
            });
        } catch (e) {
            logger.error("Falha ao pedir membros / Failed to request members", e);
        }
    };

    const onChunk = (e: any) => {
        const gid = e?.guildId ?? e?.guild_id ?? e?.guildID;
        if (gid && gid !== guildId) return;
        refresh();
        emit(false);
    };
    const onBatch = (e: any) => {
        const chunks = Array.isArray(e?.chunks) ? e.chunks : [];
        for (const chunk of chunks) onChunk(chunk);
    };

    FluxDispatcher.subscribe("GUILD_MEMBERS_CHUNK", onChunk);
    FluxDispatcher.subscribe("GUILD_MEMBERS_CHUNK_BATCH", onBatch);

    let budget = REQUEST_BUDGET;

    const runLevel = async (queries: string[]) => {
        const before = loadedMemberCount(guildId);
        let index = 0;

        const worker = async () => {
            while (index < queries.length && budget-- > 0 && !controller.cancelled) {
                request(queries[index++]);
                await sleep(STEP_MS);
            }
        };

        await Promise.all(Array.from({ length: CONCURRENCY }, worker));
        await sleep(SETTLE_MS);
        refresh();
        emit(false);
        return loaded - before;
    };

    void (async () => {
        try {
            let queries = CHARS.split("");

            for (let depth = 1; depth <= MAX_DEPTH && !controller.cancelled && budget > 0; depth++) {
                if (total && loaded >= total) break;

                const added = await runLevel(queries);
                logger.info(`Varredura nível ${depth}: +${added} (total ${loaded}/${total})`);

                if (added === 0) break; // saturou: níveis mais fundos não trazem mais ninguém
                if (depth === MAX_DEPTH) break;

                // próximo nível: todas as combinações (a -> aa, ab, ...)
                const next: string[] = [];
                for (const prefix of queries) {
                    for (const ch of CHARS) next.push(prefix + ch);
                }
                queries = next;
            }

            emit(true);
        } finally {
            FluxDispatcher.unsubscribe("GUILD_MEMBERS_CHUNK", onChunk);
            FluxDispatcher.unsubscribe("GUILD_MEMBERS_CHUNK_BATCH", onBatch);
            activeScans.delete(controller);
        }
    })();

    return controller;
}
