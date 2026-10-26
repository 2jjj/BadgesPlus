/*
 * BadgesPlus, a Vencord userplugin
 * Copyright (c) 2026 lirenzzzin
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { openPrivateChannel, sendMessage } from "@utils/discord";
import { classes } from "@utils/misc";
import { RenderModalProps, User } from "@vencord/discord-types";
import { findByPropsLazy } from "@webpack";
import {
    ChannelActionCreators, ChannelStore, GuildMemberCountStore, GuildMemberStore, GuildStore, Modal, openModal,
    showToast, Tooltip, useEffect, useMemo, useRef, UserProfileStore, UserStore, useState
} from "@webpack/common";

import { getBoostIcon, getCachedBadges, onCacheChange } from "./badgeCache";
import { badgeIconUrl, badgeSortRank, boostLevelFromPremiumSince, getBadgeLabel, getCategory, getFlagBadges, getTooltip, isCategoryEnabled, makeBoostBadge, SimpleBadge } from "./badges";
import { plural, t } from "./i18n";
import { CachedMember, captureMemberCache, clearMemberCache, ensureMemberCacheLoaded, getCachedMembers, onMemberCacheChange } from "./memberCache";
import { cancelAllMemberScans, isScanningGuild, MemberScanProgress, scanGuildMembers, searchGuildMembers } from "./memberLoader";
import { clearQueue, getQueueStats, isDone, onQueueChange, pendingCount, queueProfiles, retryFailed } from "./profileQueue";
import { settings } from "./settings";

interface MemberEntry {
    user: User;
    name: string;
    badges: SimpleBadge[];
    done: boolean;
}

// Abrir o pesquisador não pode disparar milhares de perfis sozinho (o cache tem o servidor
// inteiro). Acima disso, o usuário usa o botão "Carregar badges".
// Opening the search can't fire thousands of profiles by itself (the cache has the whole server).
// Above this, the user uses the "Load badges" button.
const OPEN_AUTO_LOAD_CAP = 500;

/** Embaralha no lugar (Fisher-Yates) / shuffles in place */
function shuffle<T>(input: T[]): T[] {
    for (let i = input.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [input[i], input[j]] = [input[j], input[i]];
    }
    return input;
}

// Ações de amizade do Discord / Discord's relationship actions
const RelationshipActions = findByPropsLazy("sendRequest", "addRelationship") as {
    sendRequest?: (data: { discordTag: string; }) => void;
} | undefined;

/** Usuário "de mentira" pra quem só existe no cache / fake user for cache-only members */
function cachedUser(member: CachedMember): User {
    return {
        id: member.id,
        username: member.username,
        discriminator: member.discriminator ?? "0",
        globalName: member.globalName,
        bot: member.bot,
        publicFlags: member.publicFlags,
        avatar: "",
        getAvatarURL: () => member.avatarUrl,
        getDefaultAvatarURL: () => member.avatarUrl
    } as unknown as User;
}

/** Abre o chat (DM) com a pessoa / opens the DM chat with the person */
function openDm(userId: string) {
    try {
        openPrivateChannel(userId);
    } catch (e) {
        console.error("[BadgesPlus] falha ao abrir a DM / failed to open the DM", e);
    }
}

/** Manda um "oi" na DM e já pula pra conversa / sends a "hi" in the DM and jumps to the chat */
async function sendHi(userId: string) {
    try {
        let channelId = ChannelStore.getDMFromUserId(userId);

        if (!channelId) {
            try {
                const res = await (ChannelActionCreators as any).ensurePrivateChannel?.(userId);
                channelId = typeof res === "string" ? res : res?.id;
            } catch {
                // sem canal: cai no fallback abaixo / no channel: falls back below
            }
        }

        if (!channelId) {
            // Não deu pra criar a DM: abre a conversa pra pessoa digitar.
            // Couldn't create the DM: open the chat so the person can type.
            openDm(userId);
            showToast("Abri a conversa — digite e envie");
            return;
        }

        await sendMessage(channelId, { content: "oi" });
        openDm(userId);
        showToast("oi enviado!", "success");
    } catch (e) {
        console.error("[BadgesPlus] falha ao mandar oi / failed to send hi", e);
        openDm(userId);
        showToast("Falha ao mandar oi — veja o console", "failure");
    }
}

/** Manda pedido de amizade (nome#0000, ou só o nome novo sem discriminador) / sends a friend request */
function addFriend(user: User) {
    try {
        const discriminator = (user as any).discriminator ?? "0";
        const tag = discriminator && discriminator !== "0" ? `${user.username}#${discriminator}` : user.username;
        const res = RelationshipActions?.sendRequest?.({ discordTag: tag });

        if (res && typeof (res as any).then === "function") {
            (res as any)
                .then(() => showToast("Pedido de amizade enviado!", "success"))
                .catch(() => showToast("Não deu pra enviar o pedido — tente pelo perfil", "failure"));
        } else {
            showToast("Pedido de amizade enviado!", "success");
        }
    } catch (e) {
        console.error("[BadgesPlus] falha ao adicionar amigo / failed to add friend", e);
        showToast("Não deu pra adicionar — tente pelo perfil", "failure");
    }
}

/** Recalcula quando perfis, membros ou a fila mudam / Recomputes when profiles, members or the queue change */
function useGuildMembers(guildId: string, includeBots: boolean, cachedMembers: CachedMember[]) {
    const [tick, setTick] = useState(0);

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        // throttle (não debounce!): agenda um recálculo, mas não empurra ele pra frente pra sempre.
        // Com debounce, durante o carregamento contínuo o timer reiniciava a cada perfil e nunca
        // disparava — a lista congelava e o carregamento parava. / throttle (not debounce!): schedule
        // a recompute but don't keep pushing it back. With debounce, during continuous loading the
        // timer reset on every profile and never fired — the list froze and loading stopped.
        const onChange = () => {
            if (timer != null) return;
            timer = setTimeout(() => {
                timer = undefined;
                setTick(n => n + 1);
            }, 400);
        };
        UserProfileStore.addChangeListener(onChange);
        GuildMemberStore.addChangeListener(onChange);
        const unsubscribe = onQueueChange(onChange);
        const unsubscribeCache = onCacheChange(onChange);
        return () => {
            clearTimeout(timer);
            UserProfileStore.removeChangeListener(onChange);
            GuildMemberStore.removeChangeListener(onChange);
            unsubscribe();
            unsubscribeCache();
        };
    }, []);

    return useMemo(() => {
        const entries: MemberEntry[] = [];
        const seen = new Set<string>();
        const cachedById = new Map(cachedMembers.map(member => [member.id, member]));

        const push = (id: string, user: User, cached?: CachedMember) => {
            const member: any = GuildMemberStore.getMember(guildId, id);
            const profile = UserProfileStore.getUserProfile(id);
            let badges = (profile?.badges as SimpleBadge[] | undefined) ?? getCachedBadges(id) ?? getFlagBadges(user);

            // Badge de impulso sem buscar perfil: vem do premiumSince do membro. O ícone é aprendido
            // de qualquer perfil de booster já carregado. / Boost badge without a profile fetch: it
            // comes from the member's premiumSince. The icon is learned from any booster profile cached.
            const level = boostLevelFromPremiumSince(member?.premiumSince ?? cached?.premiumSince);
            const boost = makeBoostBadge(level, getBoostIcon(level));
            if (boost && !badges.some(b => b.id === boost.id)) badges = [...badges, boost];

            entries.push({
                user,
                name: member ? GuildMemberStore.getNick(guildId, id) ?? (user as any).globalName ?? user.username
                    : cached?.nick ?? cached?.globalName ?? user.username,
                badges,
                done: isDone(id)
            });
            seen.add(id);
        };

        for (const id of GuildMemberStore.getMemberIds(guildId)) {
            const cached = cachedById.get(id);
            const user = UserStore.getUser(id) ?? (cached ? cachedUser(cached) : undefined);
            if (!user || (user.bot && !includeBots)) continue;
            push(id, user, cached);
        }

        // Quem só existe no cache (sessões anteriores) também entra no filtro.
        // Cache-only members from previous sessions are included too.
        for (const cached of cachedMembers) {
            if (seen.has(cached.id) || (cached.bot && !includeBots)) continue;
            push(cached.id, UserStore.getUser(cached.id) ?? cachedUser(cached), cached);
        }

        return entries;
    }, [guildId, includeBots, tick, cachedMembers]);
}

function BadgeIcon({ badge, size, dim }: { badge: SimpleBadge; size: number; dim?: boolean; }) {
    return (
        <Tooltip text={getTooltip(badge)}>
            {props => (
                <img
                    {...props}
                    className="vc-badgesplus-search-icon"
                    style={{ opacity: dim ? 0.35 : 1 }}
                    src={badgeIconUrl(badge.icon)}
                    width={size}
                    height={size}
                    alt={getBadgeLabel(badge)}
                    draggable={false}
                />
            )}
        </Tooltip>
    );
}

function MessageIcon() {
    return (
        <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2.8C6.7 2.8 2.5 6.5 2.5 11.1c0 2.4 1.2 4.6 3.1 6.1-.2 1.4-.8 2.7-1.8 3.7-.2.2-.1.6.2.6 2.2 0 4-.8 5.3-1.8.9.2 1.8.3 2.7.3 5.3 0 9.5-3.7 9.5-8.3S17.3 2.8 12 2.8Z" />
        </svg>
    );
}

function FriendIcon() {
    return (
        <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M9.5 12.5a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-3.1 0-5.6 1.7-5.6 4V21h11.2v-2.5c0-2.3-2.5-4-5.6-4Zm8.75-6.75V5.5h-1.5v2.25H14.5v1.5h2.25V11.5h1.5V9.25h2.25v-1.5Z" />
        </svg>
    );
}

function SearchBadgesModal({ guildId, modalProps }: { guildId: string; modalProps: RenderModalProps; }) {
    const s = settings.use();
    const [selected, setSelected] = useState<string[]>([]);
    const [cachedMembers, setCachedMembers] = useState<CachedMember[]>([]);

    const members = useGuildMembers(guildId, s.searchIncludeBots, s.cacheMembers ? cachedMembers : []);
    const profilesLoaded = members.filter(member => member.done).length;
    const guild = GuildStore.getGuild(guildId);
    const memberCount = GuildMemberCountStore.getMemberCount(guildId);
    const myId = UserStore.getCurrentUser()?.id;
    const pending = pendingCount();
    // total já carregado, sem o filtro de bots / total already loaded, without the bot filter
    const rawLoaded = GuildMemberStore.getMemberIds(guildId).length;
    const [scan, setScan] = useState<MemberScanProgress | null>(null);
    const [stats, setStats] = useState(getQueueStats());
    const [profilesPaused, setProfilesPaused] = useState(false);
    const autoScanStarted = useRef(false);

    // Atualiza o placar dos perfis uma vez por segundo / refresh the profile tally once a second
    useEffect(() => {
        const interval = setInterval(() => setStats(getQueueStats()), 1000);
        return () => clearInterval(interval);
    }, []);

    // Carrega a lista de membros salva e mantém ela fresca enquanto o pesquisador está aberto.
    // Loads the saved member list and keeps it fresh while the search is open.
    useEffect(() => {
        if (!s.cacheMembers) {
            setCachedMembers([]);
            return;
        }

        let active = true;
        const update = () => {
            if (active) setCachedMembers(getCachedMembers(guildId) ?? []);
        };

        update();
        void ensureMemberCacheLoaded(guildId).then(() => {
            update();
            void captureMemberCache(guildId, true);
        });

        const unsubscribe = onMemberCacheChange(guildId, update);
        const interval = setInterval(() => void captureMemberCache(guildId), 10000);

        return () => {
            active = false;
            unsubscribe();
            clearInterval(interval);
        };
    }, [guildId, s.cacheMembers]);

    // ---- filtros do pesquisador / search filters ----
    const [usernameQuery, setUsernameQuery] = useState("");
    const [lenInput, setLenInput] = useState("");
    const [badgeQuery, setBadgeQuery] = useState("");

    const lengthFilter = useMemo(() => {
        const n = parseInt(lenInput, 10);
        return Number.isFinite(n) && n > 0 && n <= 32 ? n : null;
    }, [lenInput]);

    // Por padrão mostra TUDO (igual antes). O filtro por categoria só entra se você ligar
    // "Pesquisar só as categorias ligadas"; o "esconder quest" também é opcional.
    // By default it shows EVERYTHING (like before). The category filter only kicks in if you
    // enable "Search only the enabled categories"; the "hide quest" toggle is optional too.
    const filtered = useMemo(() => {
        const q = usernameQuery.trim().toLowerCase();
        return members
            .map(m => ({
                ...m,
                badges: m.badges.filter(b => {
                    if (s.searchRespectCategories && !isCategoryEnabled(b)) return false;
                    if (s.searchHideQuestBadges && getCategory(b) === "quests") return false;
                    return true;
                })
            }))
            .filter(m => {
                if (lengthFilter != null && m.user.username.length !== lengthFilter) return false;
                if (q && !m.user.username.toLowerCase().includes(q) && !m.name.toLowerCase().includes(q)) return false;
                return true;
            });
    }, [
        members, usernameQuery, lengthFilter, s.searchHideQuestBadges, s.searchRespectCategories,
        s.showNitro, s.showBoost, s.showHypeSquad, s.showHypeSquadEvents, s.showDiscordPrograms,
        s.showLegacyUsername, s.showQuests, s.showOther
    ]);

    const missing = filtered.filter(m => !m.done);
    // Embaralha também no botão manual, pela mesma razão do timer.
    // Shuffle the manual button too, same reason as the timer.
    const loadMissing = () => {
        setProfilesPaused(false);
        queueProfiles(shuffle(missing.map(m => m.user.id)));
    };

    // ids que casam com o filtro de nome/tamanho, sempre atualizado pro timer ler
    // ids matching the name/length filter, kept fresh for the timer to read
    const filteredIdsRef = useRef<string[]>([]);
    useEffect(() => {
        filteredIdsRef.current = filtered.map(m => m.user.id);
    }, [filtered]);

    // todos os ids conhecidos (live + cache), sem o filtro / every known id (live + cache), unfiltered
    const knownIdsRef = useRef<string[]>([]);
    useEffect(() => {
        knownIdsRef.current = members.map(m => m.user.id);
    }, [members]);

    const hasTextFilter = usernameQuery.trim().length > 0 || lengthFilter != null;

    function startMemberScan() {
        if (isScanningGuild(guildId)) return;
        autoScanStarted.current = true;
        setScan({ loaded: rawLoaded, total: memberCount || 0, done: false, cancelled: false });
        scanGuildMembers(
            guildId,
            progress => {
                setScan(progress.done ? null : progress);
                if (progress.done) void captureMemberCache(guildId, true);
            },
            { maxStepWaitMs: s.memberScanSpeed }
        );
    }

    function stopMemberScan() {
        cancelAllMemberScans();
        setScan(null);
    }

    // Quando o usuário filtra ou escolhe uma badge, garante que a lista inteira seja carregada.
    // When the user filters or picks a badge, make sure the whole member list gets loaded.
    useEffect(() => {
        if (!isScanningGuild(guildId)) autoScanStarted.current = false;
    }, [guildId, usernameQuery, lengthFilter]);

    useEffect(() => {
        if (!s.searchAutoScanMembers) return;
        if (autoScanStarted.current) return;
        if (!hasTextFilter && selected.length === 0) return;
        if (isScanningGuild(guildId)) return;
        if (memberCount > 0 && members.length >= memberCount) return;
        startMemberScan();
    }, [guildId, hasTextFilter, selected.length, s.searchAutoScanMembers, memberCount, members.length]);

    // Digitar 2+ letras também consulta o servidor inteiro pelo gateway.
    // Typing 2+ letters also queries the whole server through the gateway.
    useEffect(() => {
        if (!s.searchServerMemberSearch) return;
        const query = usernameQuery.trim();
        if (query.length < 2) return;

        const timer = setTimeout(() => void searchGuildMembers(guildId, query), 500);
        return () => clearTimeout(timer);
    }, [guildId, usernameQuery, s.searchServerMemberSearch]);

    // Carregamento independente do React: um timer lê direto as stores e reenfileira quem ainda não
    // tem perfil. Com filtro de nome/tamanho, carrega SÓ quem casa com o filtro — assim você acha o
    // que quer (ex.: 3 letras) sem queimar o limite de requisições com o servidor inteiro.
    // React-independent loading: a timer reads the stores directly and re-queues whoever has no
    // profile yet. With a name/length filter it loads ONLY matching members — so you find what you
    // want (e.g. 3-char names) without burning the rate limit on the whole server.
    // Trocar o filtro reativa o carregamento que o "Parar perfis" tinha pausado.
    // Changing the filter resumes loading that "Stop profiles" had paused.
    useEffect(() => {
        setProfilesPaused(false);
    }, [usernameQuery, lengthFilter, selected.length]);

    useEffect(() => {
        if (profilesPaused) return;

        // Com uma badge escolhida, "todo mundo" inclui quem ainda não teve perfil carregado.
        // With a badge selected, "everyone" includes members whose profiles haven't loaded yet.
        const autoLoadWanted = s.searchAutoLoad
            || hasTextFilter
            || (selected.length > 0 && s.searchAutoLoadOnBadge);
        if (!autoLoadWanted) return;

        const loadMissingNow = () => {
            const allIds = knownIdsRef.current;
            // carregamento automático ao abrir: só em escopo pequeno; o resto é no botão
            // automatic load on open: only in a small scope; the rest is via the button
            if (!hasTextFilter && selected.length === 0 && allIds.length > OPEN_AUTO_LOAD_CAP) return;

            const allMissing = allIds.filter(id => !isDone(id));
            if (!allMissing.length) return;

            let ordered: string[];

            const priorityIds = filteredIdsRef.current;
            if (hasTextFilter) {
                // Com filtro: carrega SÓ quem passa no filtro. Antes ele enfileirava o servidor
                // inteiro atrás dos matches — digitava "3 letras" e tomava rate limit à toa.
                // With a filter: load ONLY matching members. Before, it queued the whole server
                // behind the matches — typing "3 chars" hit the rate limit for nothing.
                const prioritySet = new Set(priorityIds);
                ordered = allMissing.filter(id => prioritySet.has(id));
            } else {
                // Sem filtro: embaralha pra NÃO pegar sempre os mesmos de cima.
                // Without a filter: shuffle so it does NOT always grab the same top ones.
                ordered = shuffle([...allMissing]);
            }

            const limit = s.searchAutoLoadLimit;
            if (limit > 0) {
                const doneCount = hasTextFilter
                    ? priorityIds.length - ordered.length
                    : allIds.length - allMissing.length;
                ordered = ordered.slice(0, Math.max(0, limit - doneCount));
            }

            if (ordered.length) queueProfiles(ordered, hasTextFilter);
        };

        loadMissingNow();
        const interval = setInterval(loadMissingNow, 1000);
        return () => clearInterval(interval);
    }, [guildId, s.searchAutoLoad, s.searchAutoLoadOnBadge, s.searchAutoLoadLimit, hasTextFilter, selected.length, profilesPaused]);

    // Ao fechar o pesquisador, para a varredura e LIMPA a fila: não deixa carregamento de servidor
    // gigante rodando em segundo plano (era isso que estourava o limite e travava as DMs).
    // On closing the search, stop the scan and CLEAR the queue: don't leave a huge guild load running
    // in the background (that's what blew the rate limit and froze DMs).
    useEffect(() => () => {
        cancelAllMemberScans();
        clearQueue();
    }, []);

    // badges entre os membros filtrados, com contagem / badges among the filtered members, with counts
    const groups = useMemo(() => {
        const map = new Map<string, { badge: SimpleBadge; count: number; }>();
        for (const m of filtered) {
            for (const b of m.badges) {
                const g = map.get(b.id);
                if (g) g.count++;
                else map.set(b.id, { badge: b, count: 1 });
            }
        }
        return [...map.values()].sort((a, b) =>
            badgeSortRank(a.badge) - badgeSortRank(b.badge) || b.count - a.count
        );
    }, [filtered]);

    // filtra os botões de badge pelo texto digitado / narrows the badge chips by the typed text
    const shownGroups = useMemo(() => {
        const q = badgeQuery.trim().toLowerCase();
        if (!q) return groups;
        return groups.filter(({ badge }) =>
            getBadgeLabel(badge).toLowerCase().includes(q) || badge.id.toLowerCase().includes(q)
        );
    }, [groups, badgeQuery]);

    const results = useMemo(() => {
        if (!selected.length) return [];
        const has = (m: MemberEntry, id: string) => m.badges.some(b => b.id === id);
        return filtered
            .filter(m => s.searchMatchMode === "any"
                ? selected.some(id => has(m, id))
                : selected.every(id => has(m, id)))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [filtered, selected, s.searchMatchMode]);

    const toggle = (id: string) =>
        setSelected(sel => sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]);

    const emptyText = missing.length > 0
        ? t("Nobody found yet — still loading profiles.", "Ninguém encontrado ainda — ainda carregando perfis.")
        : s.searchMatchMode === "any"
            ? t("Nobody has any of the selected badges.", "Ninguém tem nenhuma das badges selecionadas.")
            : t("Nobody has all the selected badges.", "Ninguém tem todas as badges selecionadas.");

    return (
        <Modal
            {...modalProps}
            size="md"
            title={t("Search badges", "Pesquisar badges")}
            subtitle={guild ? t(`in ${guild.name}`, `em ${guild.name}`) : undefined}
        >
            <div className="vc-badgesplus-search">
                <div className="vc-badgesplus-search-info">
                    <span>
                        {t(`Members: ${members.length}`, `Membros: ${members.length}`)}
                        {memberCount ? ` / ${memberCount}` : ""}
                        {" · "}{t(`badges loaded: ${profilesLoaded}`, `badges carregadas: ${profilesLoaded}`)}
                    </span>
                    {cachedMembers.length > 0 && (
                        <button
                            className="vc-badgesplus-link"
                            onClick={() => void clearMemberCache(guildId)}
                        >
                            {t(`Clear cached members (${cachedMembers.length})`, `Limpar membros em cache (${cachedMembers.length})`)}
                        </button>
                    )}
                    {pending > 0
                        ? (
                            <span>
                                {t(`Loading… ${pending} left`, `Carregando… ${pending} restantes`)}{" · "}
                                <button
                                    className="vc-badgesplus-link"
                                    onClick={() => {
                                        clearQueue();
                                        setProfilesPaused(true);
                                    }}
                                >
                                    {t("Stop profiles", "Parar perfis")}
                                </button>
                            </span>
                        )
                        : missing.length > 0 && (
                            <button className="vc-badgesplus-link" onClick={loadMissing}>
                                {t(`Load badges of ${missing.length} members`, `Carregar badges de ${missing.length} membros`)}
                            </button>
                        )}
                </div>

                {(scan || (memberCount > 0 && rawLoaded < memberCount)) && (
                    <div className="vc-badgesplus-search-info">
                        {scan
                            ? (
                                <span>
                                    {t(
                                        `Scanning members… ${scan.loaded}${scan.total ? `/${scan.total}` : ""}`,
                                        `Varrendo membros… ${scan.loaded}${scan.total ? `/${scan.total}` : ""}`
                                    )}{" · "}
                                    <button className="vc-badgesplus-link" onClick={stopMemberScan}>{t("Stop members", "Parar membros")}</button>
                                </span>
                            )
                            : (
                                <>
                                    <span>
                                        {t("Discord only sent part of the member list.", "O Discord mandou só parte da lista de membros.")}
                                    </span>
                                    <button className="vc-badgesplus-link" onClick={startMemberScan}>
                                        {t("Load more members", "Carregar mais membros")}
                                    </button>
                                </>
                            )}
                    </div>
                )}

                <div className="vc-badgesplus-search-info">
                    <span>
                        {t(
                            `Profiles: ${stats.ok} loaded${stats.failed ? ` · ${stats.failed} unavailable` : ""}${stats.pending ? ` · ${stats.pending} queued` : ""}`,
                            `Perfis: ${stats.ok} carregados${stats.failed ? ` · ${stats.failed} indisponíveis` : ""}${stats.pending ? ` · ${stats.pending} na fila` : ""}`
                        )}
                    </span>
                    {stats.pausedMs > 0 && (
                        <span>
                            {t(
                                `Waiting on Discord's limit (~${Math.ceil(stats.pausedMs / 1000)}s)`,
                                `Aguardando limite do Discord (~${Math.ceil(stats.pausedMs / 1000)}s)`
                            )}
                        </span>
                    )}
                    {stats.failed > 0 && (
                        <button
                            className="vc-badgesplus-link"
                            onClick={() => {
                                const ids = retryFailed();
                                const allowed = new Set(filtered.map(m => m.user.id));
                                setProfilesPaused(false);
                                queueProfiles(ids.filter(id => allowed.has(id)));
                                setStats(getQueueStats());
                            }}
                        >
                            {t(`Retry ${stats.failed} unavailable`, `Tentar de novo ${stats.failed} indisponíveis`)}
                        </button>
                    )}
                </div>

                <div className="vc-badgesplus-controls">
                    <input
                        className="vc-badgesplus-input"
                        value={usernameQuery}
                        onChange={e => setUsernameQuery(e.target.value)}
                        placeholder={t("Filter by username…", "Filtrar por nome…")}
                    />
                    <div className="vc-badgesplus-len">
                        <input
                            className="vc-badgesplus-input vc-badgesplus-leninput"
                            type="number"
                            min={1}
                            max={32}
                            value={lenInput}
                            onChange={e => setLenInput(e.target.value)}
                            placeholder={t("chars", "letras")}
                            aria-label={t("Username length", "Tamanho do nome de usuário")}
                        />
                        {[2, 3, 4].map(n => (
                            <button
                                key={n}
                                className={classes("vc-badgesplus-lenbtn", lengthFilter === n && "vc-badgesplus-lenbtn-active")}
                                aria-pressed={lengthFilter === n}
                                onClick={() => setLenInput(lengthFilter === n ? "" : String(n))}
                            >
                                {n}
                            </button>
                        ))}
                    </div>
                    <input
                        className="vc-badgesplus-input"
                        value={badgeQuery}
                        onChange={e => setBadgeQuery(e.target.value)}
                        placeholder={t("Find a badge (e.g. opal, ruby)…", "Achar uma badge (ex.: opala, rubi)…")}
                    />
                </div>

                {hasTextFilter && (
                    <div className="vc-badgesplus-search-info">
                        <span>
                            {plural(filtered.length, "member matches the filter", "members match the filter", "membro bate com o filtro", "membros batem com o filtro")}
                            {missing.length > 0 && ` · ${t(`${missing.length} still to load`, `${missing.length} ainda pra carregar`)}`}
                        </span>
                    </div>
                )}

                {shownGroups.length > 0
                    ? (
                        <div className="vc-badgesplus-chips">
                            {shownGroups.map(({ badge, count }) => {
                                const isSelected = selected.includes(badge.id);
                                return (
                                    <button
                                        key={badge.id}
                                        className={classes("vc-badgesplus-chip", isSelected && "vc-badgesplus-chip-selected")}
                                        aria-pressed={isSelected}
                                        onClick={() => toggle(badge.id)}
                                    >
                                        <img src={badgeIconUrl(badge.icon)} width={16} height={16} alt="" />
                                        <span>{getBadgeLabel(badge)}</span>
                                        <span className="vc-badgesplus-count">{count}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )
                    : <div className="vc-badgesplus-search-info">{t("No badges found yet. Load the members' badges above.", "Nenhuma badge encontrada ainda. Carregue as badges dos membros acima.")}</div>}

                {selected.length > 0 && (
                    <div className="vc-badgesplus-results">
                        <div className="vc-badgesplus-search-info">
                            <span>
                                {results.length === 0
                                    ? emptyText
                                    : plural(results.length, "person found", "people found", "pessoa encontrada", "pessoas encontradas")}
                            </span>
                            <button className="vc-badgesplus-link" onClick={() => setSelected([])}>{t("Clear selection", "Limpar seleção")}</button>
                        </div>
                        {results.slice(0, s.searchMaxResults).map(m => (
                            <div key={m.user.id} className="vc-badgesplus-row">
                                <div
                                    className="vc-badgesplus-person"
                                    onClick={() => {
                                        openDm(m.user.id);
                                        if (s.searchCloseOnMessage) (modalProps as any).onClose?.();
                                    }}
                                >
                                    <img
                                        className="vc-badgesplus-avatar"
                                        src={m.user.getAvatarURL(guildId, 32)}
                                        width={32}
                                        height={32}
                                        alt=""
                                    />
                                    <div className="vc-badgesplus-names">
                                        <span className="vc-badgesplus-name">{m.name}</span>
                                        <span className="vc-badgesplus-username">{m.user.username}</span>
                                    </div>
                                </div>
                                <div className="vc-badgesplus-row-badges">
                                    {m.badges.map(b => (
                                        <BadgeIcon key={b.id} badge={b} size={20} dim={!selected.includes(b.id)} />
                                    ))}
                                </div>
                                {s.searchShowMessageButton && m.user.id !== myId && !m.user.bot && (
                                    <>
                                        <Tooltip text={t("Send \"oi\"", "Mandar \"oi\"")}>
                                            {props => (
                                                <button
                                                    {...props}
                                                    className="vc-badgesplus-message"
                                                    aria-label={t("Send \"oi\"", "Mandar \"oi\"")}
                                                    onClick={() => void sendHi(m.user.id)}
                                                >
                                                    <MessageIcon />
                                                </button>
                                            )}
                                        </Tooltip>
                                        <Tooltip text={t("Add friend", "Adicionar amigo")}>
                                            {props => (
                                                <button
                                                    {...props}
                                                    className="vc-badgesplus-addfriend"
                                                    aria-label={t("Add friend", "Adicionar amigo")}
                                                    onClick={() => addFriend(m.user)}
                                                >
                                                    <FriendIcon />
                                                </button>
                                            )}
                                        </Tooltip>
                                    </>
                                )}
                            </div>
                        ))}
                        {results.length > s.searchMaxResults && (
                            <div className="vc-badgesplus-search-info">{t(`Showing the first ${s.searchMaxResults}.`, `Mostrando os primeiros ${s.searchMaxResults}.`)}</div>
                        )}
                    </div>
                )}
            </div>
        </Modal>
    );
}

export function openSearchBadges(guildId: string) {
    openModal(modalProps => <SearchBadgesModal guildId={guildId} modalProps={modalProps} />);
}
