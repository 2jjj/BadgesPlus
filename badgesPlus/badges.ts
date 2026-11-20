/*
 * BadgesPlus, a Vencord userplugin
 * Copyright (c) 2026 lirenzzzin
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { User } from "@vencord/discord-types";

import { plural, t } from "./i18n";
import { settings } from "./settings";

export interface SimpleBadge {
    id: string;
    description: string;
    icon: string;
}

export const badgeIconUrl = (icon: string) => `https://cdn.discordapp.com/badge-icons/${icon}.png`;

// Ícones oficiais de impulso por nível. Antes o ícone só era conhecido depois de carregar o perfil
// de algum booster; com este mapa a badge de impulso aparece na hora pra todo mundo que tem
// `premiumSince`, mesmo sem nenhum perfil carregado. / Official boost icons per level. Before, the
// icon was only known after loading some booster's profile; with this map the boost badge shows up
// right away for everyone with a `premiumSince`, even with no profile loaded at all.
export const BOOST_ICONS: Record<number, string> = {
    1: "51040c70d4f20a921ad6674ff86fc95c",
    2: "0e4080d1d333bc7ad29ef6528b6f2fb7",
    3: "72bed924410c304dbe3d00a6e593ff59",
    4: "df199d2050d3ed4ebf84d64ae83989f8",
    5: "996b3e870e8a22ce519b3a50e6bdd52f",
    6: "991c9f39ee33d7537d9f408c3e53141e",
    7: "cb3ae83c15e970e8f3d410bc62cb8b99",
    8: "7142225d31238f6387d9f09efaa02759",
    9: "ec92202290b48d0879b7413d2dde3bab",
};

/**
 * Junta badges de várias fontes sem duplicar id nenhum. A ordem de preferência é a ordem dos
 * argumentos. É o que garante que um perfil incompleto (ou uma lista vazia) nunca esconda as
 * badges que já estavam no cache ou nas flags públicas.
 * Merges badges from several sources, deduping by id. Argument order is preference order. This
 * guarantees an incomplete profile (or an empty list) never hides badges already known from the
 * cache or the public flags.
 */
export function mergeBadges(...sources: Array<readonly SimpleBadge[] | undefined | null>): SimpleBadge[] {
    const seen = new Set<string>();
    const merged: SimpleBadge[] = [];

    for (const source of sources) {
        if (!source) continue;
        for (const badge of source) {
            if (!badge?.id || seen.has(badge.id)) continue;
            seen.add(badge.id);
            merged.push(badge);
        }
    }

    return merged;
}

// Badges que dá pra descobrir só pelas flags públicas, sem buscar o perfil.
// Badges that can be read from public flags alone, without fetching the profile.
// Nitro só aparece quando o perfil completo carrega (impulso é derivado do membro).
// Nitro only shows up once the full profile is loaded (boost is derived from the member).
const FLAG_BADGES: Array<SimpleBadge & { flag: number; }> = [
    { flag: 1 << 0, id: "staff", description: "Discord Staff", icon: "5e74e9b61934fc1f67c65515d1f7e60d" },
    { flag: 1 << 1, id: "partner", description: "Partnered Server Owner", icon: "3f9748e53446a137a052f3454e2de41e" },
    { flag: 1 << 18, id: "certified_moderator", description: "Moderator Programs Alumni", icon: "fee1624003e2fee35cb398e125dc479b" },
    { flag: 1 << 2, id: "hypesquad", description: "HypeSquad Events", icon: "bf01d1073931f921909045f3a39fd264" },
    { flag: 1 << 6, id: "hypesquad_house_1", description: "HypeSquad Bravery", icon: "8a88d63823d8a71cd5e390baa45efa02" },
    { flag: 1 << 7, id: "hypesquad_house_2", description: "HypeSquad Brilliance", icon: "011940fd013da3f7fb926e4a1cd2e618" },
    { flag: 1 << 8, id: "hypesquad_house_3", description: "HypeSquad Balance", icon: "3aa41de486fa12454c3761e8e223442e" },
    { flag: 1 << 3, id: "bug_hunter_level_1", description: "Discord Bug Hunter", icon: "2717692c7dca7289b35297368a940dd0" },
    { flag: 1 << 14, id: "bug_hunter_level_2", description: "Discord Bug Hunter", icon: "848f79194d4be5ff5f81505cbd0ce1e6" },
    { flag: 1 << 22, id: "active_developer", description: "Active Developer", icon: "6bdc42827a38498929a4920da12695d9" },
    { flag: 1 << 17, id: "verified_developer", description: "Early Verified Bot Developer", icon: "6df5892e0f35b051f8b61eace34f4967" },
    { flag: 1 << 9, id: "early_supporter", description: "Early Supporter", icon: "7060786766c9c840eb3019e725d2b358" },
];

export function getFlagBadges(user: User): SimpleBadge[] {
    const flags = user.publicFlags ?? 0;
    return FLAG_BADGES.filter(b => (flags & b.flag) === b.flag);
}

// Badge genérica de Nitro, disponível na hora pelo `premiumType` do usuário (o objeto de usuário do
// cliente já traz isso). O nível/tenure continua vindo do perfil, mas a badge de Nitro não espera
// mais busca de perfil — que era o motivo dela demorar enquanto a HypeSquad aparecia na hora.
// Generic Nitro badge, available immediately from the user's `premiumType` (the client's user object
// already carries it). The tenure tier still comes from the profile, but the Nitro badge no longer
// waits for a profile fetch — which was why it lagged while HypeSquad showed instantly.
export const NITRO_ICON = "2ba85e8026a8614b640c2837bcdfe21b";

export function getPremiumBadges(user: User): SimpleBadge[] {
    const premiumType = Number((user as any).premiumType) || 0;
    if (premiumType <= 0) return [];
    return [{ id: "premium", description: "Nitro", icon: NITRO_ICON }];
}

// ---- Nomes / Names -----------------------------------------------------------

const LABELS: Record<string, [en: string, pt: string]> = {
    premium: ["Nitro", "Nitro"],
    staff: ["Discord Staff", "Funcionário do Discord"],
    partner: ["Partner", "Parceiro"],
    certified_moderator: ["Moderator Alumni", "Ex-moderador"],
    hypesquad: ["HypeSquad Events", "HypeSquad Eventos"],
    hypesquad_house_1: ["HypeSquad Bravery", "HypeSquad Bravery"],
    hypesquad_house_2: ["HypeSquad Brilliance", "HypeSquad Brilliance"],
    hypesquad_house_3: ["HypeSquad Balance", "HypeSquad Balance"],
    bug_hunter_level_1: ["Bug Hunter", "Caçador de Bugs"],
    bug_hunter_level_2: ["Bug Hunter Level 2", "Caçador de Bugs Nível 2"],
    active_developer: ["Active Developer", "Desenvolvedor Ativo"],
    verified_developer: ["Verified Bot Developer", "Dev de Bot Verificado"],
    early_supporter: ["Early Supporter", "Apoiador Inicial"],
    legacy_username: ["Originally known as", "Nome antigo"],
    quest_completed: ["Completed a Quest", "Missão concluída"],
    orb_profile_badge: ["Orbs", "Orbs"],
    bot_commands: ["Supports Commands", "Comandos de bot"],
    automod: ["AutoMod", "AutoMod"],
    application_guild_subscription: ["App subscription", "Assinatura de app"],
};

const TENURE: Record<number, [en: string, pt: string]> = {
    1: ["Bronze", "Bronze"],
    3: ["Silver", "Prata"],
    6: ["Gold", "Ouro"],
    12: ["Platinum", "Platina"],
    24: ["Diamond", "Diamante"],
    36: ["Emerald", "Esmeralda"],
    60: ["Ruby", "Rubi"],
    72: ["Opal", "Opala"],
};

const BOOST_MONTHS = [0, 1, 2, 3, 6, 9, 12, 15, 18, 24];

const tenureMonths = (id: string) => Number(/^premium_tenure_(\d+)_month/.exec(id)?.[1] ?? NaN);
const boostLevel = (id: string) => Number(/^guild_booster_lvl(\d+)/.exec(id)?.[1] ?? NaN);

/**
 * Nível de impulso (1..9) a partir do `premiumSince` do membro. Isso vem junto com o membro na
 * varredura do gateway, então NÃO precisa buscar perfil pra saber que a pessoa impulsiona.
 * Boost level (1..9) from the member's `premiumSince`. It comes with the member in the gateway scan,
 * so you DON'T need to fetch a profile to know someone boosts.
 */
export function boostLevelFromPremiumSince(premiumSince: string | Date | null | undefined, now = Date.now()): number {
    if (!premiumSince) return 0;
    const start = new Date(premiumSince).getTime();
    if (!Number.isFinite(start)) return 0;
    const months = (now - start) / (1000 * 60 * 60 * 24 * 30.4375);
    let lvl = 0;
    for (let i = 1; i < BOOST_MONTHS.length; i++) {
        if (months >= BOOST_MONTHS[i]) lvl = i;
        else break;
    }
    return lvl;
}

/** Monta a badge de impulso a partir do nível + ícone conhecido / builds the boost badge from level + known icon */
export function makeBoostBadge(level: number, icon: string | undefined): SimpleBadge | null {
    if (level < 1 || !icon) return null;
    return { id: `guild_booster_lvl${level}`, description: "Server Boost", icon };
}

/** Nome curto da badge / Short badge name */
export function getBadgeLabel(badge: SimpleBadge): string {
    if (LABELS[badge.id]) return t(...LABELS[badge.id]);

    const months = tenureMonths(badge.id);
    if (!isNaN(months)) {
        const tier = TENURE[months] ? t(...TENURE[months]) : plural(months, "month", "months", "mês", "meses");
        return `Nitro ${tier}`;
    }

    const lvl = boostLevel(badge.id);
    if (!isNaN(lvl)) {
        const m = BOOST_MONTHS[lvl] ?? lvl;
        return `${t("Boost", "Impulso")} ${plural(m, "month", "months", "mês", "meses")}`;
    }

    // badge nova / new badge: usa o texto do Discord / use Discord's text
    return badge.description;
}

export const getTooltip = (badge: SimpleBadge) =>
    settings.store.tooltipText === "discord" ? badge.description : getBadgeLabel(badge);

// ---- Custom filter / Filtro personalizado --------------------------------------

const filterWhitespace = /[\s,;]+/;

/** Lê a lista de badges do campo personalizado e descarta lixo / parses the custom badge list and drops
 * anything empty. Tokens ending with `*` match by prefix. */
export function parseBadgeFilterList(raw: string | undefined | null): Set<string> {
    const out = new Set<string>();
    for (const token of (raw ?? "").toLowerCase().split(filterWhitespace)) {
        const trimmed = token.trim();
        if (trimmed) out.add(trimmed);
    }
    return out;
}

export function badgeFilterMatches(id: string, tokens: Set<string>) {
    const lower = id.toLowerCase();
    for (const token of tokens) {
        if (token.endsWith("*")) {
            if (lower.startsWith(token.slice(0, -1))) return true;
        } else if (token === lower) {
            return true;
        }
    }
    return false;
}

// ---- Categorias / Categories ------------------------------------------------

type Category = "nitro" | "boost" | "hypesquad" | "hypesquadEvents" | "programs" | "legacy" | "quests" | "other";

const PROGRAMS = new Set([
    "staff", "partner", "certified_moderator", "bug_hunter_level_1", "bug_hunter_level_2",
    "active_developer", "verified_developer", "early_supporter"
]);

export function getCategory(badge: SimpleBadge): Category {
    const { id } = badge;
    if (id === "premium" || id.startsWith("premium_tenure_")) return "nitro";
    if (id.startsWith("guild_booster_")) return "boost";
    // HypeSquad Events é uma badge antiga e separada das três casas / HypeSquad Events is an
    // old badge, kept separate from the three houses
    if (id === "hypesquad") return "hypesquadEvents";
    if (id.startsWith("hypesquad_house_")) return "hypesquad";
    if (PROGRAMS.has(id)) return "programs";
    if (id === "legacy_username") return "legacy";
    if (id.startsWith("quest") || id.startsWith("orb")) return "quests";
    return "other";
}

const CATEGORY_SETTING = {
    nitro: "showNitro",
    boost: "showBoost",
    hypesquad: "showHypeSquad",
    hypesquadEvents: "showHypeSquadEvents",
    programs: "showDiscordPrograms",
    legacy: "showLegacyUsername",
    quests: "showQuests",
    other: "showOther",
} as const;

export const isCategoryEnabled = (badge: SimpleBadge) =>
    settings.store[CATEGORY_SETTING[getCategory(badge)]];

// ---- Ordem / Order ---------------------------------------------------------

const isNitroOrBoost = (b: SimpleBadge) => ["nitro", "boost"].includes(getCategory(b));

/** Filtro personalizado por id de badge / custom badge id filter */
export function customBadgeFilter(badge: SimpleBadge): boolean {
    if (settings.store.badgeFilterMode === "all") return true;

    const tokens = parseBadgeFilterList(settings.store.badgeFilterIds);
    if (!tokens.size) return true;

    const match = badgeFilterMatches(badge.id, tokens);
    return settings.store.badgeFilterMode === "only" ? match : !match;
}

/** Aplica filtros e ordem das configurações / Applies the filters and order from settings */
export function filterAndSortBadges(badges: SimpleBadge[]): SimpleBadge[] {
    const mode = settings.store.badgeFilterMode;

    // No modo "Só as badges da lista" a lista vence as categorias: o usuário quis DISSO aqui.
    // In "only listed" mode the custom list wins over the categories: the user asked for exactly these.
    const visible = mode === "only"
        ? badges.filter(customBadgeFilter)
        : badges.filter(isCategoryEnabled).filter(customBadgeFilter);

    switch (settings.store.badgeOrder) {
        case "nitroFirst":
            return [...visible.filter(isNitroOrBoost), ...visible.filter(b => !isNitroOrBoost(b))];
        case "nitroLast":
            return [...visible.filter(b => !isNitroOrBoost(b)), ...visible.filter(isNitroOrBoost)];
        default:
            return visible;
    }
}

/** Ordem dos botões no pesquisador / Button order in the search: Nitro, tiers, boosts, rest */
export function badgeSortRank(badge: SimpleBadge): number {
    if (badge.id === "premium") return 0;
    const months = tenureMonths(badge.id);
    if (!isNaN(months)) return 1 + months / 1000;
    const lvl = boostLevel(badge.id);
    if (!isNaN(lvl)) return 2 + lvl / 100;
    return 3;
}
