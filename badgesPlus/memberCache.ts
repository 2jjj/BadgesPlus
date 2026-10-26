/*
 * BadgesPlus, a Vencord userplugin
 * Copyright (c) 2026 lirenzzzin
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { Logger } from "@utils/Logger";
import { GuildMemberStore, UserStore } from "@webpack/common";

import { settings } from "./settings";

const logger = new Logger("BadgesPlus");

const PREFIX = "BadgesPlus:members:v1:";
const FLUSH_MS = 4000;
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export interface CachedMember {
    id: string;
    username: string;
    globalName?: string;
    discriminator?: string;
    nick?: string | null;
    bot: boolean;
    publicFlags: number;
    premiumSince?: string | null;
    avatarUrl: string;
    capturedAt: number;
}

interface MemberCacheFile {
    capturedAt: number;
    members: CachedMember[];
}

const cache = new Map<string, CachedMember[]>();
const listeners = new Map<string, Set<() => void>>();
const loading = new Map<string, Promise<void>>();
const loaded = new Set<string>();
const dirty = new Set<string>();
const lastCaptureCount = new Map<string, number>();
const lastCaptureAt = new Map<string, number>();

const REFRESH_MS = 5 * 60 * 1000;

let flushTimer: ReturnType<typeof setTimeout> | undefined;

const storeKey = (guildId: string) => `${PREFIX}${guildId}`;

function notify(guildId: string) {
    listeners.get(guildId)?.forEach(listener => listener());
}

function isFresh(member: CachedMember) {
    return Date.now() - member.capturedAt < MAX_AGE_MS;
}

function avatarUrl(user: any, guildId: string) {
    try {
        return user.getAvatarURL(guildId, 64) as string;
    } catch {
        return "https://cdn.discordapp.com/embed/avatars/0.png";
    }
}

export function onMemberCacheChange(guildId: string, listener: () => void) {
    let set = listeners.get(guildId);
    if (!set) {
        set = new Set();
        listeners.set(guildId, set);
    }
    set.add(listener);

    return () => {
        set!.delete(listener);
        if (!set!.size) listeners.delete(guildId);
    };
}

export function getCachedMembers(guildId: string): CachedMember[] | undefined {
    return cache.get(guildId);
}

export function isMemberCacheLoaded(guildId: string) {
    return loaded.has(guildId);
}

/** Carrega o cache de membros do servidor uma vez / loads the guild's member cache once */
export function ensureMemberCacheLoaded(guildId: string): Promise<void> {
    if (loaded.has(guildId)) return Promise.resolve();

    let promise = loading.get(guildId);
    if (!promise) {
        promise = (async () => {
            try {
                const file = await DataStore.get<MemberCacheFile>(storeKey(guildId));
                if (file?.members?.length) {
                    const fresh = file.members.filter(isFresh);
                    cache.set(guildId, fresh);
                    logger.info(`Cache de membros: ${fresh.length} em ${guildId} / ${fresh.length} cached members`);
                } else {
                    cache.set(guildId, []);
                }
            } catch (e) {
                logger.error("Falha ao carregar o cache de membros / failed to load member cache", e);
                if (!cache.has(guildId)) cache.set(guildId, []);
            } finally {
                loaded.add(guildId);
                loading.delete(guildId);
                notify(guildId);
            }
        })();
        loading.set(guildId, promise);
    }

    return promise;
}

/**
 * Atualiza o cache com quem o cliente já conhece. Não apaga quem veio de sessões
 * anteriores: o merge é o que mantém a lista inteira disponível depois de reiniciar.
 * Updates the cache with everyone the client already knows. It doesn't drop members from
 * previous sessions: the merge is what keeps the full list available after a restart.
 */
export async function captureMemberCache(guildId: string, force = false): Promise<void> {
    if (!settings.store.cacheMembers) return;

    await ensureMemberCacheLoaded(guildId);

    const liveIds = GuildMemberStore.getMemberIds(guildId);
    if (!liveIds.length) return;

    const now = Date.now();
    if (!force
        && liveIds.length === lastCaptureCount.get(guildId)
        && now - (lastCaptureAt.get(guildId) ?? 0) < REFRESH_MS) {
        return;
    }
    lastCaptureCount.set(guildId, liveIds.length);
    lastCaptureAt.set(guildId, now);

    const map = new Map<string, CachedMember>();
    for (const member of cache.get(guildId) ?? []) map.set(member.id, member);

    let captured = 0;

    for (const id of liveIds) {
        const user: any = UserStore.getUser(id);
        if (!user) continue;

        const member: any = GuildMemberStore.getMember(guildId, id);
        const premiumSince = member?.premiumSince;
        const avatar = avatarUrl(user, guildId);

        map.set(id, {
            id,
            username: user.username,
            globalName: user.globalName,
            discriminator: user.discriminator,
            nick: GuildMemberStore.getNick(guildId, id),
            bot: !!user.bot,
            publicFlags: Number(user.publicFlags) || 0,
            premiumSince: premiumSince ? new Date(premiumSince).toISOString() : null,
            avatarUrl: avatar,
            capturedAt: now
        });
        captured++;
    }

    if (!captured) return;

    cache.set(guildId, [...map.values()]);
    dirty.add(guildId);
    notify(guildId);
    scheduleMemberCacheFlush();
}

export function scheduleMemberCacheFlush() {
    if (flushTimer != null) return;
    flushTimer = setTimeout(() => {
        flushTimer = undefined;
        void flushMemberCache();
    }, FLUSH_MS);
}

/** Grava no disco o que mudou / writes changed guilds to disk */
export async function flushMemberCache() {
    if (!dirty.size) return;

    const guildIds = [...dirty];
    dirty.clear();

    try {
        await DataStore.setMany(
            guildIds.map(guildId => [
                storeKey(guildId),
                {
                    capturedAt: Date.now(),
                    members: cache.get(guildId) ?? []
                } satisfies MemberCacheFile
            ] as [string, MemberCacheFile])
        );
    } catch (e) {
        logger.error("Falha ao salvar o cache de membros / failed to save member cache", e);
    }
}

/** Limpa o cache de um servidor / clears one guild's member cache */
export async function clearMemberCache(guildId: string) {
    cache.set(guildId, []);
    loaded.add(guildId);
    dirty.delete(guildId);
    lastCaptureCount.set(guildId, 0);
    lastCaptureAt.set(guildId, 0);

    try {
        await DataStore.del(storeKey(guildId));
    } catch (e) {
        logger.error("Falha ao limpar o cache de membros / failed to clear member cache", e);
    }

    notify(guildId);
}

export function getMemberCacheSize(guildId: string) {
    return cache.get(guildId)?.length ?? 0;
}
