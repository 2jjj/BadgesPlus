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
const REQUEST_BUDGET = 9000;
const CONCURRENCY = 6;
const STEP_MS = 90; // intervalo entre despachos / gap between dispatches
const SETTLE_MS = 900; // espera os chunks chegarem / wait for the chunks

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Embaralha (Fisher-Yates) / shuffles */
function shuffled<T>(input: T[]): T[] {
    for (let i = input.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [input[i], input[j]] = [input[j], input[i]];
    }
    return input;
}

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
            // Constrói TODAS as consultas de uma vez e embaralha. Além de 1 e 2 letras, sorteia
            // trechos de 3 letras: cada rodada usa uma amostra diferente, então NÃO pega sempre os
            // mesmos primeiros — vai variando e, com o cache, cobrindo mais gente a cada vez.
            // Builds ALL queries at once and shuffles them. Besides 1 and 2 chars, it samples 3-char
            // fragments: every run uses a different sample, so it does NOT always grab the same first
            // ones — it varies and, with the cache, covers more people each time.
            const singles = CHARS.split("");
            const doubles: string[] = [];
            for (const a of CHARS) for (const b of CHARS) doubles.push(a + b);
            const triples: string[] = [];
            for (let i = 0; i < 5000; i++) {
                let s = "";
                for (let j = 0; j < 3; j++) s += CHARS[Math.floor(Math.random() * CHARS.length)];
                triples.push(s);
            }
            const queries = shuffled([...singles, ...doubles, ...triples]);

            const added = await runLevel(queries);
            logger.info(`Varredura: +${added} (total ${loaded}/${total})`);

            emit(true);
        } finally {
            FluxDispatcher.unsubscribe("GUILD_MEMBERS_CHUNK", onChunk);
            FluxDispatcher.unsubscribe("GUILD_MEMBERS_CHUNK_BATCH", onBatch);
            activeScans.delete(controller);
        }
    })();

    return controller;
}
