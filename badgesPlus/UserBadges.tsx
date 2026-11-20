/*
 * BadgesPlus, a Vencord userplugin
 * Copyright (c) 2026 lirenzzzin
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { User } from "@vencord/discord-types";
import { GuildMemberStore, Tooltip, useEffect, useReducer, UserProfileStore, UserStore, useStateFromStores } from "@webpack/common";

import { getBoostIcon, getCachedBadges, isCacheLoaded, onCacheChange } from "./badgeCache";
import { badgeIconUrl, boostLevelFromPremiumSince, filterAndSortBadges, getBadgeLabel, getFlagBadges, getPremiumBadges, getTooltip, makeBoostBadge, mergeBadges, SimpleBadge } from "./badges";
import { queueProfiles } from "./profileQueue";
import { settings } from "./settings";

export function UserBadges({ user, where, guildId }: { user: User; where: "chat" | "list"; guildId?: string; }) {
    // settings.use: reage na hora a mudanças nas configurações / re-renders as soon as a setting changes
    const s = settings.use();

    // re-renderiza quando o cache em disco carrega / re-renders when the disk cache loads
    const [, forceUpdate] = useReducer(x => x + 1, 0);
    const cachedBadges = getCachedBadges(user.id);
    useEffect(() => {
        const unsubscribe = onCacheChange(forceUpdate);
        // fecha a corrida: o cache pode terminar de carregar entre o render e este efeito.
        // closes the race: the cache may finish loading between render and this effect.
        if (cachedBadges == null && isCacheLoaded()) forceUpdate();
        return unsubscribe;
    }, []);

    const enabled = where === "chat" ? s.showInChat : s.showInMemberList;
    const allowed = enabled
        && (s.showOnBots || !user.bot)
        && (s.showOnSelf || user.id !== UserStore.getCurrentUser()?.id);

    const profileBadges = useStateFromStores(
        [UserProfileStore],
        () => UserProfileStore.getUserProfile(user.id)?.badges as SimpleBadge[] | undefined
    );

    const needsProfile = allowed && profileBadges == null && cachedBadges == null;

    useEffect(() => {
        if (!needsProfile || !s.fetchProfiles) return;
        if (user.bot && !s.fetchBotProfiles) return;

        // quem está na tela passa na frente / whoever is on screen jumps the queue
        queueProfiles([user.id], true);

        // tenta de novo de tempos em tempos: se a busca falhou (rede/limite), a badge de Nitro não
        // fica faltando muito tempo só porque a linha não desmontou.
        // retries from time to time: if the fetch failed (network/limit), the Nitro badge doesn't
        // stay missing for long just because the row didn't unmount.
        const timer = setInterval(() => queueProfiles([user.id], true), 15000);
        return () => clearInterval(timer);
    }, [user.id, needsProfile, s.fetchProfiles, s.fetchBotProfiles]);

    if (!allowed) return null;

    // junta tudo: perfil > cache > flags públicas. Assim um perfil parcial (ou vazio) nunca
    // esconde badges que já eram conhecidas, e as flags aparecem mesmo antes do perfil chegar.
    // merge everything: profile > cache > public flags. So a partial (or empty) profile never hides
    // badges already known, and flags show even before the profile arrives.
    let badges = mergeBadges(profileBadges, cachedBadges, getPremiumBadges(user), getFlagBadges(user));

    // Impulso sem buscar perfil: nível pelo premiumSince do membro + ícone fixo por nível.
    // Boost without a profile fetch: level from the member's premiumSince + fixed icon per level.
    if (guildId) {
        const member = GuildMemberStore.getMember(guildId, user.id);
        const level = boostLevelFromPremiumSince((member as any)?.premiumSince);
        const boost = makeBoostBadge(level, getBoostIcon(level));
        if (boost && !badges.some(b => b.id === boost.id)) badges = [...badges, boost];
    }

    const all = filterAndSortBadges(badges);
    if (!all.length) return null;

    const shown = s.maxBadges > 0 ? all.slice(0, s.maxBadges) : all;
    const hidden = all.slice(shown.length);
    const size = where === "chat" ? s.chatBadgeSize : s.memberListBadgeSize;

    return (
        <span className="vc-badgesplus" style={{ gap: s.badgeSpacing }}>
            {shown.map(badge => (
                <Tooltip key={badge.id} text={getTooltip(badge)}>
                    {tooltipProps => (
                        <img
                            {...tooltipProps}
                            className="vc-badgesplus-badge"
                            src={badgeIconUrl(badge.icon)}
                            alt={getBadgeLabel(badge)}
                            width={size}
                            height={size}
                            draggable={false}
                        />
                    )}
                </Tooltip>
            ))}
            {hidden.length > 0 && s.showOverflowCount && (
                <Tooltip text={hidden.map(getTooltip).join(", ")}>
                    {tooltipProps => (
                        <span {...tooltipProps} className="vc-badgesplus-overflow" style={{ fontSize: Math.max(10, size - 6) }}>
                            +{hidden.length}
                        </span>
                    )}
                </Tooltip>
            )}
        </span>
    );
}
