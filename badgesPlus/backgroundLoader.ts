/*
 * BadgesPlus, a Vencord userplugin
 * Copyright (c) 2026 lirenzzzin
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import { ChannelStore, GuildMemberStore, GuildStore, RelationshipStore, UserStore } from "@webpack/common";

import { captureMemberCache } from "./memberCache";
import { deepScanMembers, isDeepScanFresh, isScanningGuild } from "./memberLoader";
import { bulkPendingCount, clearBulkLoader, queueBulkProfiles, setBulkDelay } from "./profileQueue";
import { settings } from "./settings";

const logger = new Logger("BadgesPlus");

const REBUILD_EVERY = 30_000;
const CAPTURE_EVERY = 10 * 60 * 1000;

let interval: ReturnType<typeof setInterval> | undefined;
let lastCapture = 0;
let deepScanGuild: string | undefined;
let premiumSampleLogged = false;

function dmRecipientIds(): string[] {
    try {
        const sorted = (ChannelStore as any).getSortedPrivateChannels?.();
        if (Array.isArray(sorted)) {
            return sorted.flatMap((entry: any) => entry?.channel?.recipients ?? []);
        }

        const channels = (ChannelStore as any).getPrivateChannels?.();
        if (channels) return Object.values(channels).flatMap((channel: any) => channel?.recipients ?? []);
    } catch (e) {
        logger.warn("Não consegui enumerar as DMs / couldn't enumerate DMs", e);
    }

    return [];
}

function friendIds(): string[] {
    try {
        const rels = (RelationshipStore as any)?.getRelationships?.() ?? (RelationshipStore as any)?.getRelations?.();
        if (!rels) return [];
        return Object.values(rels)
            .filter((rel: any) => rel?.type === 1)
            .map((rel: any) => rel?.id)
            .filter(Boolean);
    } catch (e) {
        logger.warn("Não consegui enumerar os amigos / couldn't enumerate friends", e);
        return [];
    }
}

function guildIds(): string[] {
    try {
        return Object.keys(GuildStore.getGuilds?.() ?? {});
    } catch (e) {
        logger.warn("Não consegui enumerar os servidores / couldn't enumerate guilds", e);
        return [];
    }
}

function guildMemberIds(): string[] {
    const ids: string[] = [];

    for (const guildId of guildIds()) {
        const memberIds: string[] = GuildMemberStore.getMemberIds(guildId) ?? [];
        ids.push(...memberIds);
    }

    return ids;
}

// Diagnóstico leve: confirma se o `premiumType` já vem no usuário (permite mostrar Nitro na hora).
// Light diagnostic: confirms whether `premiumType` already comes with the user (lets us show Nitro instantly).
function logPremiumSample() {
    try {
        const ids = guildMemberIds().slice(0, 400);
        let known = 0;
        let nitro = 0;

        for (const id of ids) {
            const type = Number((UserStore.getUser(id) as any)?.premiumType);
            if (Number.isFinite(type)) known++;
            if (type > 0) nitro++;
        }

        logger.info(`premiumType: ${known}/${ids.length} disponíveis, ${nitro} com Nitro / available, with Nitro`);
    } catch { /* amostra é opcional / sample is optional */ }
}

function collect(): string[] {
    const target = settings.store.backgroundLoadTarget;
    const seen = new Set<string>();

    if (target !== "dms") {
        for (const id of guildMemberIds()) seen.add(id);
    }

    if (target !== "servers") {
        for (const id of dmRecipientIds()) seen.add(id);
        for (const id of friendIds()) seen.add(id);
    }

    return [...seen];
}

function run() {
    if (!settings.store.backgroundLoadAll) return;

    if (!premiumSampleLogged) {
        premiumSampleLogged = true;
        logPremiumSample();
    }

    const before = bulkPendingCount();
    queueBulkProfiles(collect());

    const queued = bulkPendingCount();
    if (queued > before) {
        logger.info(`Carga de fundo: ${queued} perfis na fila (devagar, seguro) / background load: ${queued} profiles queued (slow, safe)`);
    }

    // Captura o que o cliente já sabe pro cache em disco (a pesquisa cobre todo mundo depois).
    // Captures what the client already knows into the disk cache (the search covers everyone later).
    const now = Date.now();
    if (now - lastCapture > CAPTURE_EVERY) {
        lastCapture = now;
        for (const guildId of guildIds()) void captureMemberCache(guildId);
    }

    maybeDeepScan();
}

// Uma varredura profunda por vez, pra abrir o servidor inteiro além do teto da lista de membros.
// One deep scan at a time, to open the whole server past the member list cap.
function maybeDeepScan() {
    if (!settings.store.backgroundDeepScanAll) return;
    if (deepScanGuild) return;

    for (const guildId of guildIds()) {
        if (isScanningGuild(guildId)) return;

        // marca cedo pra não tropeçar nela na próxima volta / mark early so the next tick doesn't trip over it
        deepScanGuild = guildId;
        void (async () => {
            if (await isDeepScanFresh(guildId)) {
                deepScanGuild = undefined;
                return;
            }

            deepScanMembers(
                guildId,
                progress => {
                    if (progress.done || progress.cancelled) {
                        if (deepScanGuild === guildId) deepScanGuild = undefined;
                    }
                },
                { gapMs: Math.max(600, Number(settings.store.deepScanSpeed) || 800) }
            );
        })();
        return;
    }
}

/** Liga o carregamento de fundo / starts the background loader */
export function startBackgroundLoader() {
    if (interval != null) return;

    setBulkDelay(Number(settings.store.backgroundLoadAllSpeed) || 2500);
    run();
    interval = setInterval(run, REBUILD_EVERY);
}

/** Desliga e limpa a fila / stops and clears the queue */
export function stopBackgroundLoader() {
    if (interval != null) {
        clearInterval(interval);
        interval = undefined;
    }

    deepScanGuild = undefined;
    clearBulkLoader();
}
