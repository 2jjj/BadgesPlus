/*
 * BadgesPlus, a Vencord userplugin
 * Copyright (c) 2026 lirenzzzin
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { User } from "@vencord/discord-types";
import { Tooltip, useEffect, useReducer, UserProfileStore, UserStore, useStateFromStores } from "@webpack/common";

import { getCachedBadges, onCacheChange } from "./badgeCache";
import { badgeIconUrl, filterAndSortBadges, getBadgeLabel, getFlagBadges, getTooltip, SimpleBadge } from "./badges";
import { queueProfiles } from "./profileQueue";
import { settings } from "./settings";

export function UserBadges({ user, where }: { user: User; where: "chat" | "list"; }) {
    // settings.use: reage na hora a mudanças nas configurações / re-renders as soon as a setting changes
    const s = settings.use();

    // re-renderiza quando o cache em disco carrega / re-renders when the disk cache loads
    const [, forceUpdate] = useReducer(x => x + 1, 0);
    useEffect(() => onCacheChange(forceUpdate), []);

    const enabled = where === "chat" ? s.showInChat : s.showInMemberList;
    const allowed = enabled
        && (s.showOnBots || !user.bot)
        && (s.showOnSelf || user.id !== UserStore.getCurrentUser()?.id);

    const profileBadges = useStateFromStores(
        [UserProfileStore],
        () => UserProfileStore.getUserProfile(user.id)?.badges as SimpleBadge[] | undefined
    ) ?? getCachedBadges(user.id);

    useEffect(() => {
        if (!allowed || profileBadges || !s.fetchProfiles) return;
        if (user.bot && !s.fetchBotProfiles) return;
        // quem está na tela passa na frente / whoever is on screen jumps the queue
        queueProfiles([user.id], true);
    }, [user.id, allowed, profileBadges, s.fetchProfiles, s.fetchBotProfiles]);

    if (!allowed) return null;

    const all = filterAndSortBadges(profileBadges ?? getFlagBadges(user));
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
