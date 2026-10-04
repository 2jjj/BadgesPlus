/*
 * BadgesPlus, a Vencord userplugin
 * Copyright (c) 2026 lirenzzzin
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

import { setMinDelay } from "./profileQueue";

export const settings = definePluginSettings({
    // ---- Onde mostrar --------------------------------------------------------
    showInChat: {
        type: OptionType.BOOLEAN,
        displayName: "Mostrar no chat",
        description: "Mostra as badges logo depois do nome nas mensagens.",
        default: true
    },
    showInMemberList: {
        type: OptionType.BOOLEAN,
        displayName: "Mostrar na lista de membros",
        description: "Mostra as badges logo depois do nome na lista de membros (servidores e DMs).",
        default: true
    },
    showOnSelf: {
        type: OptionType.BOOLEAN,
        displayName: "Mostrar as minhas badges",
        description: "Mostra as badges na sua própria conta também.",
        default: true
    },
    showOnBots: {
        type: OptionType.BOOLEAN,
        displayName: "Mostrar em bots",
        description: "Mostra badges em bots (ex.: Comandos de bot, AutoMod).",
        default: false
    },

    // ---- Aparência -----------------------------------------------------------
    chatBadgeSize: {
        type: OptionType.SLIDER,
        displayName: "Tamanho no chat",
        description: "Tamanho das badges no chat, em pixels.",
        markers: [12, 14, 16, 18, 20, 22, 24],
        default: 18,
        stickToMarkers: true
    },
    memberListBadgeSize: {
        type: OptionType.SLIDER,
        displayName: "Tamanho na lista de membros",
        description: "Tamanho das badges na lista de membros, em pixels.",
        markers: [12, 14, 16, 18, 20, 22, 24],
        default: 16,
        stickToMarkers: true
    },
    badgeSpacing: {
        type: OptionType.SLIDER,
        displayName: "Espaço entre badges",
        description: "Espaço entre uma badge e outra, em pixels.",
        markers: [0, 1, 2, 3, 4, 6, 8],
        default: 3,
        stickToMarkers: true
    },
    maxBadges: {
        type: OptionType.SLIDER,
        displayName: "Máximo de badges por pessoa",
        description: "Quantas badges mostrar ao lado do nome. 0 = todas.",
        markers: [0, 1, 2, 3, 4, 5, 6, 8, 10],
        default: 0,
        stickToMarkers: true
    },
    showOverflowCount: {
        type: OptionType.BOOLEAN,
        displayName: "Mostrar \"+N\" quando passar do máximo",
        description: "Mostra quantas badges ficaram escondidas pelo limite acima.",
        default: true
    },
    badgeOrder: {
        type: OptionType.SELECT,
        displayName: "Ordem das badges",
        description: "Em que ordem as badges aparecem ao lado do nome.",
        options: [
            { label: "Igual ao perfil do Discord", value: "discord", default: true },
            { label: "Nitro e impulso primeiro", value: "nitroFirst" },
            { label: "Nitro e impulso por último", value: "nitroLast" },
        ]
    },
    tooltipText: {
        type: OptionType.SELECT,
        displayName: "Texto ao passar o mouse",
        description: "O que aparece quando você passa o mouse em cima de uma badge.",
        options: [
            { label: "Nome curto (ex.: Nitro Opala)", value: "label", default: true },
            { label: "Texto do Discord (ex.: Assinante desde...)", value: "discord" },
        ]
    },

    // ---- Quais badges mostrar ------------------------------------------------
    showNitro: {
        type: OptionType.BOOLEAN,
        displayName: "Badges de Nitro",
        description: "Nitro e níveis de Nitro (Bronze, Prata, Ouro... Opala).",
        default: true
    },
    showBoost: {
        type: OptionType.BOOLEAN,
        displayName: "Badges de impulso",
        description: "Impulso de servidor (1 mês até 24 meses).",
        default: true
    },
    showHypeSquad: {
        type: OptionType.BOOLEAN,
        displayName: "Badges da HypeSquad",
        description: "Bravery, Brilliance, Balance e HypeSquad Eventos.",
        default: true
    },
    showDiscordPrograms: {
        type: OptionType.BOOLEAN,
        displayName: "Badges de programas do Discord",
        description: "Funcionário, Parceiro, Caçador de Bugs, Ex-moderador, Apoiador Inicial, Desenvolvedor Ativo, Dev de Bot Verificado.",
        default: true
    },
    showLegacyUsername: {
        type: OptionType.BOOLEAN,
        displayName: "Badge \"Nome antigo\"",
        description: "A badge de quem tinha nome com #tag antes da mudança de nomes.",
        default: true
    },
    showQuests: {
        type: OptionType.BOOLEAN,
        displayName: "Badges de missões e Orbs",
        description: "Missão concluída, Orbs e similares.",
        default: true
    },
    showOther: {
        type: OptionType.BOOLEAN,
        displayName: "Outras badges",
        description: "Qualquer badge que não se encaixe nas categorias acima (inclusive badges novas do Discord).",
        default: true
    },

    // ---- Carregamento --------------------------------------------------------
    fetchProfiles: {
        type: OptionType.BOOLEAN,
        displayName: "Carregar perfis automaticamente",
        description: "Busca o perfil de quem aparece na tela para descobrir Nitro, impulso e outras badges que não vêm junto com o usuário. Sem isso, só aparecem as badges básicas (HypeSquad, Caçador de Bugs, Apoiador Inicial...).",
        default: true
    },
    loadSpeed: {
        type: OptionType.SELECT,
        displayName: "Velocidade de carregamento",
        description: "Intervalo entre um perfil e outro. Se o Discord pedir para ir mais devagar, o plugin desacelera sozinho e depois volta a acelerar.",
        options: [
            { label: "Rápido (0,5s)", value: 500, default: true },
            { label: "Normal (1s)", value: 1000 },
            { label: "Seguro (2s)", value: 2000 },
            { label: "Muito seguro (4s)", value: 4000 },
        ],
        onChange: (ms: number) => setMinDelay(ms)
    },
    fetchBotProfiles: {
        type: OptionType.BOOLEAN,
        displayName: "Carregar perfil de bots",
        description: "Também busca o perfil de bots. Deixe desligado para economizar requisições.",
        default: false
    },

    // ---- Pesquisa de badges ----------------------------------------------------
    showSearchButton: {
        type: OptionType.BOOLEAN,
        displayName: "Botão de pesquisar badges",
        description: "Mostra o botão de Nitro na barra do canal (perto de fixados e lista de membros) para pesquisar membros por badge.",
        default: true
    },
    searchMatchMode: {
        type: OptionType.SELECT,
        displayName: "Com várias badges selecionadas, mostrar quem tem...",
        description: "Como combinar as badges selecionadas no pesquisador.",
        options: [
            { label: "TODAS as selecionadas", value: "all", default: true },
            { label: "QUALQUER UMA das selecionadas", value: "any" },
        ]
    },
    searchAutoLoad: {
        type: OptionType.BOOLEAN,
        displayName: "Carregar badges ao abrir o pesquisador",
        description: "Começa a carregar as badges de todos os membros assim que o pesquisador abre, sem precisar clicar em \"Carregar\".",
        default: false
    },
    searchShowMessageButton: {
        type: OptionType.BOOLEAN,
        displayName: "Botão de mensagem nos resultados",
        description: "Mostra o botão que abre a DM com a pessoa.",
        default: true
    },
    searchCloseOnMessage: {
        type: OptionType.BOOLEAN,
        displayName: "Fechar o pesquisador ao abrir DM",
        description: "Fecha o pesquisador quando você clica para mandar mensagem.",
        default: true
    },
    searchIncludeBots: {
        type: OptionType.BOOLEAN,
        displayName: "Incluir bots na pesquisa",
        description: "Mostra bots nos resultados e na contagem das badges.",
        default: false
    },
    searchMaxResults: {
        type: OptionType.SLIDER,
        displayName: "Máximo de resultados",
        description: "Quantas pessoas mostrar de uma vez no pesquisador.",
        markers: [50, 100, 200, 300, 500, 1000],
        default: 300,
        stickToMarkers: true
    },
}, {
    chatBadgeSize: { hidden() { return !this.store.showInChat; } },
    memberListBadgeSize: { hidden() { return !this.store.showInMemberList; } },
    showOverflowCount: { hidden() { return this.store.maxBadges === 0; } },
    loadSpeed: { hidden() { return !this.store.fetchProfiles && !this.store.showSearchButton; } },
    fetchBotProfiles: { hidden() { return !this.store.fetchProfiles; } },
    searchMatchMode: { hidden() { return !this.store.showSearchButton; } },
    searchAutoLoad: { hidden() { return !this.store.showSearchButton; } },
    searchShowMessageButton: { hidden() { return !this.store.showSearchButton; } },
    searchCloseOnMessage: { hidden() { return !this.store.showSearchButton || !this.store.searchShowMessageButton; } },
    searchIncludeBots: { hidden() { return !this.store.showSearchButton; } },
    searchMaxResults: { hidden() { return !this.store.showSearchButton; } },
});
