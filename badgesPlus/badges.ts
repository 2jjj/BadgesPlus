/*
 * BadgesPlus, a Vencord userplugin
 * Copyright (c) 2026 lirenzzzin
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { User } from "@vencord/discord-types";

import { settings } from "./settings";

export interface SimpleBadge {
    id: string;
    description: string;
    icon: string;
}

export const badgeIconUrl = (icon: string) => `https://cdn.discordapp.com/badge-icons/${icon}.png`;

// Badges que dá pra descobrir só pelas flags públicas do usuário, sem buscar o perfil.
// Nitro e impulso de servidor só aparecem quando o perfil completo é carregado.
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

// ---- Nomes em português ------------------------------------------------------

const LABELS: Record<string, string> = {
    premium: "Nitro",
    staff: "Funcionário do Discord",
    partner: "Parceiro",
    certified_moderator: "Ex-moderador",
    hypesquad: "HypeSquad Eventos",
    hypesquad_house_1: "HypeSquad Bravery",
    hypesquad_house_2: "HypeSquad Brilliance",
    hypesquad_house_3: "HypeSquad Balance",
    bug_hunter_level_1: "Caçador de Bugs",
    bug_hunter_level_2: "Caçador de Bugs Nível 2",
    active_developer: "Desenvolvedor Ativo",
    verified_developer: "Dev de Bot Verificado",
    early_supporter: "Apoiador Inicial",
    legacy_username: "Nome antigo",
    quest_completed: "Missão concluída",
    orb_profile_badge: "Orbs",
    bot_commands: "Comandos de bot",
    automod: "AutoMod",
    application_guild_subscription: "Assinatura de app",
};

const TENURE: Record<number, string> = {
    1: "Bronze", 3: "Prata", 6: "Ouro", 12: "Platina",
    24: "Diamante", 36: "Esmeralda", 60: "Rubi", 72: "Opala",
};

const BOOST_MONTHS = [0, 1, 2, 3, 6, 9, 12, 15, 18, 24];

const tenureMonths = (id: string) => Number(/^premium_tenure_(\d+)_month/.exec(id)?.[1] ?? NaN);
const boostLevel = (id: string) => Number(/^guild_booster_lvl(\d+)/.exec(id)?.[1] ?? NaN);

/** Nome curto da badge em português */
export function getBadgeLabel(badge: SimpleBadge): string {
    if (LABELS[badge.id]) return LABELS[badge.id];

    const months = tenureMonths(badge.id);
    if (!isNaN(months)) return `Nitro ${TENURE[months] ?? `${months} meses`}`;

    const lvl = boostLevel(badge.id);
    if (!isNaN(lvl)) {
        const m = BOOST_MONTHS[lvl] ?? lvl;
        return `Impulso ${m} ${m === 1 ? "mês" : "meses"}`;
    }

    // badge nova que ainda não está aqui: usa o texto que o Discord manda
    return badge.description;
}

export const getTooltip = (badge: SimpleBadge) =>
    settings.store.tooltipText === "discord" ? badge.description : getBadgeLabel(badge);

// ---- Categorias (para os filtros das configurações) ----------------------------

type Category = "nitro" | "boost" | "hypesquad" | "programs" | "legacy" | "quests" | "other";

const PROGRAMS = new Set([
    "staff", "partner", "certified_moderator", "bug_hunter_level_1", "bug_hunter_level_2",
    "active_developer", "verified_developer", "early_supporter"
]);

export function getCategory(badge: SimpleBadge): Category {
    const { id } = badge;
    if (id === "premium" || id.startsWith("premium_tenure_")) return "nitro";
    if (id.startsWith("guild_booster_")) return "boost";
    if (id.startsWith("hypesquad")) return "hypesquad";
    if (PROGRAMS.has(id)) return "programs";
    if (id === "legacy_username") return "legacy";
    if (id.startsWith("quest") || id.startsWith("orb")) return "quests";
    return "other";
}

const CATEGORY_SETTING = {
    nitro: "showNitro",
    boost: "showBoost",
    hypesquad: "showHypeSquad",
    programs: "showDiscordPrograms",
    legacy: "showLegacyUsername",
    quests: "showQuests",
    other: "showOther",
} as const;

export const isCategoryEnabled = (badge: SimpleBadge) =>
    settings.store[CATEGORY_SETTING[getCategory(badge)]];

// ---- Ordem -------------------------------------------------------------------

const isNitroOrBoost = (b: SimpleBadge) => ["nitro", "boost"].includes(getCategory(b));

/** Aplica os filtros e a ordem escolhidos nas configurações */
export function filterAndSortBadges(badges: SimpleBadge[]): SimpleBadge[] {
    const visible = badges.filter(isCategoryEnabled);

    switch (settings.store.badgeOrder) {
        case "nitroFirst":
            return [...visible.filter(isNitroOrBoost), ...visible.filter(b => !isNitroOrBoost(b))];
        case "nitroLast":
            return [...visible.filter(b => !isNitroOrBoost(b)), ...visible.filter(isNitroOrBoost)];
        default:
            return visible;
    }
}

/** Ordem dos botões no pesquisador: Nitro, níveis de Nitro, impulsos e o resto */
export function badgeSortRank(badge: SimpleBadge): number {
    if (badge.id === "premium") return 0;
    const months = tenureMonths(badge.id);
    if (!isNaN(months)) return 1 + months / 1000;
    const lvl = boostLevel(badge.id);
    if (!isNaN(lvl)) return 2 + lvl / 100;
    return 3;
}
