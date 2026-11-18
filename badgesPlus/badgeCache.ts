/*
 * BadgesPlus, a Vencord userplugin
 * Copyright (c) 2026 lirenzzzin
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { Logger } from "@utils/Logger";

import { BOOST_ICONS, type SimpleBadge } from "./badges";

const logger = new Logger("BadgesPlus");
const PREFIX = "BadgesPlus:badges:v1:";
const BOOST_ICON_KEY = "BadgesPlus:boostIcons:v1";
const FLUSH_MS = 3000;

// Cache persistente das badges (disco, via IndexedDB do Vencord). É o que faz o plugin NÃO recomeçar
// do topo toda vez: o que já foi buscado fica salvo e ele pula, indo avançando pra baixo até cobrir
// o servidor inteiro ao longo das sessões. / Persistent badge cache (disk, via Vencord's IndexedDB).
// This is what stops the plugin from starting over from the top every time: what was already fetched
// is saved and skipped, so it keeps advancing downward until the whole server is covered.
const cache = new Map<string, SimpleBadge[]>();
const pending = new Map<string, SimpleBadge[]>();
const listeners = new Set<() => void>();

// Ícone de cada nível de impulso, aprendido a partir de qualquer perfil de booster que carregar.
// Com ele dá pra mostrar a badge de impulso de TODO mundo só pelo `premiumSince` do membro.
// Icon for each boost level, learned from any booster profile that loads. With it we can show the
// boost badge for EVERYONE using just the member's `premiumSince`.
const boostIcons = new Map<number, string>();

export function getBoostIcon(level: number): string | undefined {
    // ícone aprendido de um perfil real vem primeiro (cobre níveis novos); o mapa fixo garante
    // que a badge apareça mesmo sem nenhum perfil de booster carregado.
    // learned icon from a real profile wins (covers new levels); the fixed map guarantees the badge
    // shows up even with no booster profile loaded.
    return boostIcons.get(level) ?? BOOST_ICONS[level];
}

function indexBoostIcons(badges: SimpleBadge[]) {
    for (const badge of badges) {
        const match = /^guild_booster_lvl(\d+)/.exec(badge.id);
        if (match) boostIcons.set(Number(match[1]), badge.icon);
    }
}

let loaded = false;
let loading: Promise<void> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | undefined;

const notify = () => listeners.forEach(l => l());

export function onCacheChange(listener: () => void) {
    listeners.add(listener);
    return () => void listeners.delete(listener);
}

export function isCacheLoaded() {
    return loaded;
}

/** Carrega o cache do disco uma vez / loads the cache from disk once */
export function ensureCacheLoaded(): Promise<void> {
    if (loaded) return Promise.resolve();
    if (!loading) {
        loading = (async () => {
            try {
                const entries = await DataStore.entries<string, SimpleBadge[]>();
                for (const [key, value] of entries) {
                    if (typeof key === "string" && key.startsWith(PREFIX) && Array.isArray(value)) {
                        cache.set(key.slice(PREFIX.length), value);
                        indexBoostIcons(value);
                    }
                }
                const icons = await DataStore.get<Record<string, string>>(BOOST_ICON_KEY);
                if (icons) for (const [level, icon] of Object.entries(icons)) boostIcons.set(Number(level), icon);
                logger.info(`Badge cache carregado: ${cache.size} perfis / loaded ${cache.size} profiles`);
            } catch (e) {
                logger.error("Falha ao carregar o cache de badges / failed to load badge cache", e);
            }
            loaded = true;
            notify();
        })();
    }
    return loading;
}

export function getCachedBadges(id: string): SimpleBadge[] | undefined {
    return cache.get(id);
}

export function hasCachedBadges(id: string) {
    return cache.has(id);
}

function sameBadges(a: SimpleBadge[], b: SimpleBadge[]) {
    return a.length === b.length && a.every((badge, i) =>
        badge.id === b[i].id
        && badge.icon === b[i].icon
        && badge.description === b[i].description
    );
}

export function setCachedBadges(id: string, badges: SimpleBadge[]) {
    const existing = cache.get(id);
    // resposta vazia não apaga o que já sabemos / an empty response never wipes what we already know
    const next = badges.length || !existing ? badges : existing;

    if (existing && sameBadges(existing, next)) return;

    cache.set(id, next);
    indexBoostIcons(next);
    pending.set(id, next);
    if (flushTimer == null) flushTimer = setTimeout(() => void flush(), FLUSH_MS);
}

/** Grava o que está pendente no disco / writes pending entries to disk */
export async function flush() {
    if (flushTimer != null) {
        clearTimeout(flushTimer);
        flushTimer = undefined;
    }
    if (!pending.size) return;

    const batch = [...pending.entries()].map(
        ([id, badges]) => [`${PREFIX}${id}`, badges] as [string, SimpleBadge[]]
    );
    pending.clear();

    try {
        await DataStore.setMany(batch);
        if (boostIcons.size) await DataStore.set(BOOST_ICON_KEY, Object.fromEntries(boostIcons));
        // sem notify aqui de propósito: gravar não muda o que está na tela, e notificar faria
        // TODAS as badges re-renderizarem a cada 3s. A carga inicial do cache já notifica.
        // no notify on purpose: saving doesn't change what's on screen, and notifying would make
        // EVERY badge re-render every 3s. The initial cache load already notifies.
    } catch (e) {
        logger.error("Falha ao salvar o cache de badges / failed to save badge cache", e);
    }
}

export function getCacheSize() {
    return cache.size;
}
