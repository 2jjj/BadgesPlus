/*
 * BadgesPlus, a Vencord userplugin
 * Copyright (c) 2026 lirenzzzin
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

import { t } from "./i18n";
import { setBulkDelay, setConcurrency, setMinDelay } from "./profileQueue";

/**
 * Adiciona nome e descrição traduzidos. São getters para que a tela de configurações
 * mostre o idioma atual sempre que for aberta.
 * Adds translated name and description as getters, so the settings screen always
 * shows the current language.
 */
function tr<const T extends object>(def: T, name: [en: string, pt: string], desc: [en: string, pt: string]) {
    return Object.defineProperties(def, {
        displayName: { get: () => t(...name), enumerable: true },
        description: { get: () => t(...desc), enumerable: true },
    }) as T & { displayName: string; description: string; };
}

export const settings = definePluginSettings({
    language: {
        type: OptionType.SELECT,
        displayName: "Language / Idioma",
        description: "Language of the plugin. / Idioma do plugin.",
        options: [
            { label: "Auto (Discord)", value: "auto", default: true },
            { label: "English", value: "en" },
            { label: "Português", value: "pt" },
        ]
    },

    // ---- Where to show / Onde mostrar -----------------------------------------
    showInChat: tr(
        { type: OptionType.BOOLEAN, default: true },
        ["Show in chat", "Mostrar no chat"],
        ["Shows badges right after the name in messages.", "Mostra as badges logo depois do nome nas mensagens."]
    ),
    showInMemberList: tr(
        { type: OptionType.BOOLEAN, default: true },
        ["Show in member list", "Mostrar na lista de membros"],
        ["Shows badges right after the name in the member list (servers and DMs).", "Mostra as badges logo depois do nome na lista de membros (servidores e DMs)."]
    ),
    showOnSelf: tr(
        { type: OptionType.BOOLEAN, default: true },
        ["Show my own badges", "Mostrar as minhas badges"],
        ["Also shows badges on your own account.", "Mostra as badges na sua própria conta também."]
    ),
    showOnBots: tr(
        { type: OptionType.BOOLEAN, default: false },
        ["Show on bots", "Mostrar em bots"],
        ["Shows badges on bots (e.g. Supports Commands, AutoMod).", "Mostra badges em bots (ex.: Comandos de bot, AutoMod)."]
    ),

    // ---- Appearance / Aparência -----------------------------------------------
    chatBadgeSize: tr(
        { type: OptionType.SLIDER, markers: [12, 14, 16, 18, 20, 22, 24], default: 18, stickToMarkers: true },
        ["Size in chat", "Tamanho no chat"],
        ["Badge size in chat, in pixels.", "Tamanho das badges no chat, em pixels."]
    ),
    memberListBadgeSize: tr(
        { type: OptionType.SLIDER, markers: [12, 14, 16, 18, 20, 22, 24], default: 16, stickToMarkers: true },
        ["Size in member list", "Tamanho na lista de membros"],
        ["Badge size in the member list, in pixels.", "Tamanho das badges na lista de membros, em pixels."]
    ),
    badgeSpacing: tr(
        { type: OptionType.SLIDER, markers: [0, 1, 2, 3, 4, 6, 8], default: 3, stickToMarkers: true },
        ["Space between badges", "Espaço entre badges"],
        ["Space between one badge and the next, in pixels.", "Espaço entre uma badge e outra, em pixels."]
    ),
    maxBadges: tr(
        { type: OptionType.SLIDER, markers: [0, 1, 2, 3, 4, 5, 6, 8, 10], default: 0, stickToMarkers: true },
        ["Max badges per person", "Máximo de badges por pessoa"],
        ["How many badges to show next to the name. 0 = all.", "Quantas badges mostrar ao lado do nome. 0 = todas."]
    ),
    showOverflowCount: tr(
        { type: OptionType.BOOLEAN, default: true },
        ["Show \"+N\" when over the limit", "Mostrar \"+N\" quando passar do máximo"],
        ["Shows how many badges were hidden by the limit above.", "Mostra quantas badges ficaram escondidas pelo limite acima."]
    ),
    badgeOrder: tr(
        {
            type: OptionType.SELECT,
            get options() {
                return [
                    { label: t("Same as the Discord profile", "Igual ao perfil do Discord"), value: "discord", default: true },
                    { label: t("Nitro and boost first", "Nitro e impulso primeiro"), value: "nitroFirst" },
                    { label: t("Nitro and boost last", "Nitro e impulso por último"), value: "nitroLast" },
                ];
            }
        },
        ["Badge order", "Ordem das badges"],
        ["In which order badges appear next to the name.", "Em que ordem as badges aparecem ao lado do nome."]
    ),
    tooltipText: tr(
        {
            type: OptionType.SELECT,
            get options() {
                return [
                    { label: t("Short name (e.g. Nitro Opal)", "Nome curto (ex.: Nitro Opala)"), value: "label", default: true },
                    { label: t("Discord's text (e.g. Subscriber since...)", "Texto do Discord (ex.: Assinante desde...)"), value: "discord" },
                ];
            }
        },
        ["Hover text", "Texto ao passar o mouse"],
        ["What shows up when you hover over a badge.", "O que aparece quando você passa o mouse em cima de uma badge."]
    ),

    // ---- Which badges / Quais badges ------------------------------------------
    showNitro: tr(
        { type: OptionType.BOOLEAN, default: true },
        ["Nitro badges", "Badges de Nitro"],
        ["Nitro and Nitro tiers (Bronze, Silver, Gold... Opal).", "Nitro e níveis de Nitro (Bronze, Prata, Ouro... Opala)."]
    ),
    showBoost: tr(
        { type: OptionType.BOOLEAN, default: true },
        ["Boost badges", "Badges de impulso"],
        ["Server boost (1 month up to 24 months).", "Impulso de servidor (1 mês até 24 meses)."]
    ),
    showHypeSquad: tr(
        { type: OptionType.BOOLEAN, default: true },
        ["HypeSquad houses", "Casas da HypeSquad"],
        ["Bravery, Brilliance and Balance.", "Bravery, Brilliance e Balance."]
    ),
    showHypeSquadEvents: tr(
        { type: OptionType.BOOLEAN, default: true },
        ["HypeSquad Events badge", "Badge HypeSquad Eventos"],
        [
            "The old HypeSquad Events badge, kept separate from the three houses.",
            "A badge antiga HypeSquad Eventos, separada das três casas."
        ]
    ),
    showDiscordPrograms: tr(
        { type: OptionType.BOOLEAN, default: true },
        ["Discord program badges", "Badges de programas do Discord"],
        [
            "Staff, Partner, Bug Hunter, Moderator Alumni, Early Supporter, Active Developer, Verified Bot Developer.",
            "Funcionário, Parceiro, Caçador de Bugs, Ex-moderador, Apoiador Inicial, Desenvolvedor Ativo, Dev de Bot Verificado."
        ]
    ),
    showLegacyUsername: tr(
        { type: OptionType.BOOLEAN, default: true },
        ["\"Originally known as\" badge", "Badge \"Nome antigo\""],
        ["The badge for people who had a #tag name before the username change.", "A badge de quem tinha nome com #tag antes da mudança de nomes."]
    ),
    showQuests: tr(
        { type: OptionType.BOOLEAN, default: true },
        ["Quest and Orbs badges", "Badges de missões e Orbs"],
        ["Completed a Quest, Orbs and similar.", "Missão concluída, Orbs e similares."]
    ),
    showOther: tr(
        { type: OptionType.BOOLEAN, default: true },
        ["Other badges", "Outras badges"],
        ["Any badge that doesn't fit the categories above (including new Discord badges).", "Qualquer badge que não se encaixe nas categorias acima (inclusive badges novas do Discord)."]
    ),

    // ---- Personalize / Personalizar -------------------------------------------
    badgeFilterMode: tr(
        {
            type: OptionType.SELECT,
            get options() {
                return [
                    { label: t("Show everything", "Mostrar tudo"), value: "all", default: true },
                    { label: t("Only the badges in the list", "Só as badges da lista"), value: "only" },
                    { label: t("Everything except the list", "Tudo, exceto as da lista"), value: "hide" },
                ];
            }
        },
        ["Badge filter", "Filtro de badges"],
        [
            "Show all badges, only the ones in the list below, or everything except the ones in the list. Applies everywhere: chat, member list and search. (Use \"Only\" together with the list below to personalize exactly which badges show up.)",
            "Mostra todas as badges, só as da lista abaixo, ou tudo menos as da lista. Vale em tudo: chat, lista de membros e pesquisador. (Combine \"Só as da lista\" com a lista abaixo pra personalizar exatamente quais badges aparecem.)"
        ]
    ),
    badgeFilterIds: tr(
        {
            type: OptionType.STRING,
            default: "",
            multiline: true,
            placeholder: "premium\npremium_tenure_12_month\nhypesquad_house_1\nguild_booster_lvl9\nquest*"
        },
        ["Badge list", "Lista de badges"],
        [
            "Badge ids, one per line (or separated by comma/space). Exact id, or a prefix ending in * (e.g. premium_* matches every Nitro tier). Use with the filter above.",
            "Ids de badge, um por linha (ou separados por vírgula/espaço). id exato, ou prefixo com * (ex.: premium_* casa com todos os níveis de Nitro). Use com o filtro acima."
        ]
    ),
    quickMessage: tr(
        {
            type: OptionType.STRING,
            default: "oi",
            placeholder: "oi"
        },
        ["Quick message", "Mensagem rápida"],
        [
            "Message the chat-bubble button sends in the search when you want to message somebody. It is sent as-is.",
            "Mensagem que o botão de balãozinho manda no pesquisador quando você quer mandar mensagem pra alguém. É enviada exatamente como está."
        ]
    ),

    // ---- Loading / Carregamento -----------------------------------------------
    fetchProfiles: tr(
        { type: OptionType.BOOLEAN, default: true },
        ["Load profiles automatically", "Carregar perfis automaticamente"],
        [
            "Fetches the profile of whoever is on screen to find Nitro, boost and other badges that don't come with the user. Without it, only basic badges show up (HypeSquad, Bug Hunter, Early Supporter...).",
            "Busca o perfil de quem aparece na tela para descobrir Nitro, impulso e outras badges que não vêm junto com o usuário. Sem isso, só aparecem as badges básicas (HypeSquad, Caçador de Bugs, Apoiador Inicial...)."
        ]
    ),
    loadSpeed: tr(
        {
            type: OptionType.SELECT,
            get options() {
                return [
                    { label: t("Fast (0.5s)", "Rápido (0,5s)"), value: 500, default: true },
                    { label: t("Normal (1s)", "Normal (1s)"), value: 1000 },
                    { label: t("Safe (2s)", "Seguro (2s)"), value: 2000 },
                    { label: t("Very safe (4s)", "Muito seguro (4s)"), value: 4000 },
                ];
            },
            onChange: (ms: number) => setMinDelay(ms)
        },
        ["Loading speed", "Velocidade de carregamento"],
        [
            "Time between one profile and the next. If Discord asks to slow down, the plugin slows down by itself and speeds up again later.",
            "Intervalo entre um perfil e outro. Se o Discord pedir para ir mais devagar, o plugin desacelera sozinho e depois volta a acelerar."
        ]
    ),
    loadConcurrency: tr(
        {
            type: OptionType.SLIDER,
            markers: [1, 2, 3, 4, 5, 6],
            default: 2,
            stickToMarkers: true,
            onChange: (n: number) => setConcurrency(n)
        },
        ["Profiles at once", "Perfis por vez"],
        [
            "How many profiles to fetch at the same time. Higher is faster; lower it if you keep getting rate limited.",
            "Quantos perfis buscar ao mesmo tempo. Mais alto é mais rápido; diminua se tomar limite de requisições."
        ]
    ),
    fetchBotProfiles: tr(
        { type: OptionType.BOOLEAN, default: false },
        ["Load bot profiles", "Carregar perfil de bots"],
        ["Also fetches bot profiles. Leave off to save requests.", "Também busca o perfil de bots. Deixe desligado para economizar requisições."]
    ),
    backgroundLoadAll: tr(
        { type: OptionType.BOOLEAN, default: true },
        ["Load everyone in the background", "Carregar tudo em segundo plano"],
        [
            "Slowly downloads the profile of everyone the client knows (loaded server member lists and DMs/friends), so badges show everywhere without opening profiles. A few profiles per minute, backs off on Discord's rate limit, resumes later, and continues across restarts — the cache is the progress bar.",
            "Vai baixando devagar o perfil de todo mundo que o cliente conhece (listas de membros carregadas e DMs/amigos), pra as badges aparecerem em todo lugar sem abrir perfil. Uns poucos perfis por minuto, recua com o limite do Discord e continua depois, inclusive depois de reiniciar — o cache é a própria barra de progresso."
        ]
    ),
    backgroundLoadTarget: tr(
        {
            type: OptionType.SELECT,
            get options() {
                return [
                    { label: t("Servers and DMs/friends", "Servidores e DMs/amigos"), value: "serversAndDms", default: true },
                    { label: t("Only servers", "Só servidores"), value: "servers" },
                    { label: t("Only DMs and friends", "Só DMs e amigos"), value: "dms" },
                ];
            }
        },
        ["Background loading: who", "Carga de fundo: quem"],
        ["Which people the background loader covers.", "Quem a carga de fundo cobre."]
    ),
    backgroundLoadAllSpeed: tr(
        {
            type: OptionType.SELECT,
            get options() {
                return [
                    { label: t("Very slow (1 per 4s)", "Muito lento (1 a cada 4s)"), value: 4000 },
                    { label: t("Slow (1 per 2.5s) — recommended", "Lento (1 a cada 2,5s) — recomendado"), value: 2500, default: true },
                    { label: t("Faster (1 per 1.5s)", "Mais rápido (1 a cada 1,5s)"), value: 1500 },
                ];
            },
            onChange: (ms: number) => setBulkDelay(ms)
        },
        ["Background loading speed", "Velocidade da carga de fundo"],
        [
            "Delay between one profile and the next in the background loader. If Discord rate-limits, it backs off and resumes later — slower is always safer for the account.",
            "Intervalo entre um perfil e o próximo na carga de fundo. Se o Discord limitar, ele recua e volta depois — mais lento é sempre mais seguro pra conta."
        ]
    ),
    backgroundDeepScanAll: tr(
        { type: OptionType.BOOLEAN, default: true },
        ["Discover the whole server (deep scan)", "Descobrir o servidor inteiro (varredura profunda)"],
        [
            "Beyond the profiles the client knows, it also slowly sweeps the server through the gateway (name-prefix search, resuming where it stopped) so even members who never loaded get badges. Runs one server at a time, re-checks every 14 days.",
            "Além dos perfis que o cliente conhece, ele também varre o servidor devagar pelo gateway (busca por prefixo de nome, retomando onde parou) pra até quem nunca carregou ganhe badges. Um servidor por vez, revisita a cada 14 dias."
        ]
    ),
    cacheMembers: tr(
        { type: OptionType.BOOLEAN, default: true },
        ["Keep the member list on disk", "Guardar a lista de membros no disco"],
        [
            "Saves who is in each server so the search already covers everyone when you reopen Discord. You can clear it in the search window.",
            "Salva quem está em cada servidor pra pesquisa já cobrir todo mundo quando você reabrir o Discord. Dá pra limpar na janela de pesquisa."
        ]
    ),

    // ---- Badge search / Pesquisa de badges ------------------------------------
    showSearchButton: tr(
        { type: OptionType.BOOLEAN, default: true },
        ["Badge search button", "Botão de pesquisar badges"],
        [
            "Shows the Nitro button in the channel bar (next to pins and member list) to search members by badge.",
            "Mostra o botão de Nitro na barra do canal (perto de fixados e lista de membros) para pesquisar membros por badge."
        ]
    ),
    searchMatchMode: tr(
        {
            type: OptionType.SELECT,
            get options() {
                return [
                    { label: t("ALL selected badges", "TODAS as selecionadas"), value: "all", default: true },
                    { label: t("ANY of the selected badges", "QUALQUER UMA das selecionadas"), value: "any" },
                ];
            }
        },
        ["With several badges selected, show who has...", "Com várias badges selecionadas, mostrar quem tem..."],
        ["How to combine the selected badges in the search.", "Como combinar as badges selecionadas no pesquisador."]
    ),
    searchAutoLoad: tr(
        { type: OptionType.BOOLEAN, default: false },
        ["Load badges when opening the search", "Carregar badges ao abrir o pesquisador"],
        [
            "Off by default: automatically loading thousands of profiles can get your account globally rate-limited (then nothing loads, not even in DMs). Turn it on if you want it, or just use the Load button.",
            "Desligado por padrão: carregar milhares de perfis sozinho pode colocar sua conta em limite global (aí não carrega nada, nem em DM). Ligue se quiser, ou use o botão Carregar."
        ]
    ),
    searchAutoLoadOnBadge: tr(
        { type: OptionType.BOOLEAN, default: true },
        ["Load everyone when picking a badge", "Carregar todo mundo ao escolher uma badge"],
        [
            "When you select a badge, it starts loading the profiles of everyone in the current scope (the whole server if there's no name filter). Results fill in as profiles arrive.",
            "Quando você escolhe uma badge, ele começa a carregar os perfis de todo mundo no escopo atual (o servidor inteiro se não tiver filtro de nome). Os resultados vão aparecendo conforme os perfis chegam."
        ]
    ),
    searchAutoScanMembers: tr(
        { type: OptionType.BOOLEAN, default: true },
        ["Scan the whole server when filtering", "Varrer o servidor inteiro ao filtrar"],
        [
            "When you type a name or pick a length, it also loads the rest of the member list in the background so the filter covers everyone. You can stop it anytime.",
            "Quando você digita um nome ou escolhe um tamanho, ele também carrega o resto da lista de membros em segundo plano pra o filtro cobrir todo mundo. Dá pra parar quando quiser."
        ]
    ),
    searchServerMemberSearch: tr(
        { type: OptionType.BOOLEAN, default: true },
        ["Search names on Discord's side", "Buscar nomes no lado do Discord"],
        [
            "When you type 2+ letters, asks Discord to search the whole server. Finds people who haven't been loaded yet, with at most one request every 2.5s.",
            "Quando você digita 2+ letras, pede pro Discord buscar no servidor inteiro. Acha quem ainda não foi carregado, com no máximo uma requisição a cada 2,5s."
        ]
    ),
    memberScanSpeed: tr(
        {
            type: OptionType.SELECT,
            get options() {
                return [
                    { label: t("Fast (250ms)", "Rápido (250ms)"), value: 250 },
                    { label: t("Normal (400ms)", "Normal (400ms)"), value: 400, default: true },
                    { label: t("Safe (700ms)", "Seguro (700ms)"), value: 700 },
                    { label: t("Very safe (1200ms)", "Muito seguro (1200ms)"), value: 1200 },
                ];
            }
        },
        ["Member scan speed", "Velocidade de varredura de membros"],
        [
            "How long to wait for the member list to load each step. It moves on as soon as the list grows. These are Discord's own member-list requests, not profile fetches.",
            "Quanto esperar a lista de membros carregar a cada passo. Ele segue assim que a lista cresce. São requisições da própria lista de membros do Discord, não buscas de perfil."
        ]
    ),
    deepScanSpeed: tr(
        {
            type: OptionType.SELECT,
            get options() {
                return [
                    { label: t("Fast (500ms)", "Rápido (500ms)"), value: 500 },
                    { label: t("Normal (800ms)", "Normal (800ms)"), value: 800, default: true },
                    { label: t("Safe (1200ms)", "Seguro (1200ms)"), value: 1200 },
                    { label: t("Slow (2000ms)", "Devagar (2000ms)"), value: 2000 },
                ];
            }
        },
        ["Deep scan speed", "Velocidade da varredura profunda"],
        [
            "Gap between name searches when loading the whole server past the member-list cap. Slower is safer and avoids Discord holding the responses.",
            "Intervalo entre buscas de nome ao carregar o servidor inteiro além do limite da lista. Mais devagar é mais seguro e evita o Discord segurar as respostas."
        ]
    ),
    searchAutoLoadLimit: tr(
        {
            type: OptionType.SLIDER,
            markers: [0, 200, 500, 1000, 2000],
            default: 0,
            stickToMarkers: true
        },
        ["Auto-load limit (profiles)", "Limite de carregamento automático (perfis)"],
        [
            "How many profiles the search loads automatically when it opens. 0 = all. Lower it if it feels heavy; you can always load the rest with the button.",
            "Quantos perfis o pesquisador carrega sozinho ao abrir. 0 = todos. Diminua se pesar; dá pra carregar o resto no botão."
        ]
    ),
    searchShowMessageButton: tr(
        { type: OptionType.BOOLEAN, default: true },
        ["Message button in results", "Botão de mensagem nos resultados"],
        ["Shows the button that opens a DM with the person.", "Mostra o botão que abre a DM com a pessoa."]
    ),
    searchCloseOnMessage: tr(
        { type: OptionType.BOOLEAN, default: true },
        ["Close the search when opening a DM", "Fechar o pesquisador ao abrir DM"],
        [
            "Closes the search when you click a person to open the DM. The \"oi\" button keeps it open so you can message several people.",
            "Fecha o pesquisador quando você clica numa pessoa pra abrir a DM. O botão \"oi\" mantém aberto pra mandar pra várias pessoas."
        ]
    ),
    searchIncludeBots: tr(
        { type: OptionType.BOOLEAN, default: false },
        ["Include bots in the search", "Incluir bots na pesquisa"],
        ["Shows bots in the results and in the badge counts.", "Mostra bots nos resultados e na contagem das badges."]
    ),
    searchHideQuestBadges: tr(
        { type: OptionType.BOOLEAN, default: false },
        ["Hide quest badges in the search", "Esconder badges de quest no pesquisador"],
        [
            "Keeps Quest/Orbs badges out of the badge buttons and the results. Off by default so the search shows everything.",
            "Tira as badges de Missão/Orbs dos botões e dos resultados. Desligado por padrão pra busca mostrar tudo."
        ]
    ),
    searchRespectCategories: tr(
        { type: OptionType.BOOLEAN, default: false },
        ["Search only the enabled categories", "Pesquisar só as categorias ligadas"],
        [
            "When on, the search only shows the badge categories you enabled under \"Which badges\". Turn it on to pick exactly what the search pulls; off shows everything.",
            "Ligado, o pesquisador só mostra as categorias que você ativou em \"Quais badges\". Ligue pra escolher exatamente o que a busca puxa; desligado mostra tudo."
        ]
    ),
    searchMaxResults: tr(
        { type: OptionType.SLIDER, markers: [50, 100, 200, 300, 500, 1000], default: 300, stickToMarkers: true },
        ["Max results", "Máximo de resultados"],
        ["How many people to show at once in the search.", "Quantas pessoas mostrar de uma vez no pesquisador."]
    ),
}, {
    chatBadgeSize: { hidden() { return !this.store.showInChat; } },
    memberListBadgeSize: { hidden() { return !this.store.showInMemberList; } },
    showOverflowCount: { hidden() { return this.store.maxBadges === 0; } },
    loadSpeed: { hidden() { return !this.store.fetchProfiles && !this.store.showSearchButton; } },
    loadConcurrency: { hidden() { return !this.store.fetchProfiles; } },
    fetchBotProfiles: { hidden() { return !this.store.fetchProfiles; } },
    cacheMembers: { hidden() { return !this.store.showSearchButton; } },
    searchMatchMode: { hidden() { return !this.store.showSearchButton; } },
    searchAutoLoad: { hidden() { return !this.store.showSearchButton; } },
    searchAutoLoadOnBadge: { hidden() { return !this.store.showSearchButton; } },
    searchAutoScanMembers: { hidden() { return !this.store.showSearchButton; } },
    searchServerMemberSearch: { hidden() { return !this.store.showSearchButton; } },
    searchAutoLoadLimit: { hidden() { return !this.store.showSearchButton; } },
    // ---- Personalize / Personalizar -------------------------------------------
    badgeFilterIds: { hidden() { return this.store.badgeFilterMode === "all"; } },

    // ---- Loading / Carregamento -----------------------------------------------
    backgroundLoadTarget: { hidden() { return !this.store.backgroundLoadAll; } },
    backgroundLoadAllSpeed: { hidden() { return !this.store.backgroundLoadAll; } },
    backgroundDeepScanAll: { hidden() { return !this.store.backgroundLoadAll; } },

    memberScanSpeed: { hidden() { return !this.store.showSearchButton; } },
    deepScanSpeed: { hidden() { return !this.store.showSearchButton; } },
    searchShowMessageButton: { hidden() { return !this.store.showSearchButton; } },
    searchCloseOnMessage: { hidden() { return !this.store.showSearchButton || !this.store.searchShowMessageButton; } },
    searchIncludeBots: { hidden() { return !this.store.showSearchButton; } },
    searchHideQuestBadges: { hidden() { return !this.store.showSearchButton; } },
    searchRespectCategories: { hidden() { return !this.store.showSearchButton; } },
    searchMaxResults: { hidden() { return !this.store.showSearchButton; } },
});
