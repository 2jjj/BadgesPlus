/*
 * BadgesPlus, a Vencord userplugin
 * Copyright (c) 2026 lirenzzzin
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Settings } from "@api/Settings";
import { LocaleStore } from "@webpack/common";

export type Lang = "en" | "pt";

/**
 * Idioma atual: o escolhido nas configurações ou, no modo automático, o do Discord.
 * Current language: the one picked in settings or, in auto mode, Discord's.
 */
export function getLang(): Lang {
    const choice = Settings.plugins.BadgesPlus?.language ?? "auto";
    if (choice === "en" || choice === "pt") return choice;
    return LocaleStore?.locale?.toLowerCase().startsWith("pt") ? "pt" : "en";
}

/** t("English", "Português") */
export const t = (en: string, pt: string) => getLang() === "pt" ? pt : en;

/** plural("person", "people", "pessoa", "pessoas", n) -> "1 person" / "3 pessoas" */
export const plural = (n: number, enOne: string, enMany: string, ptOne: string, ptMany: string) =>
    `${n} ${n === 1 ? t(enOne, ptOne) : t(enMany, ptMany)}`;
