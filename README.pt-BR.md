# BadgesPlus

[🇺🇸 English](README.md) · **🇧🇷 Português**

Plugin para o **[Vesktop](https://github.com/Vencord/Vesktop)** (e Vencord) que mostra as badges do perfil das pessoas **sem precisar abrir o perfil** e permite **pesquisar membros do servidor por badge**.

- Badges logo depois do nome, **no chat e na lista de membros**
- Pesquisador de badges: encontre quem tem **Nitro Opala**, **Apoiador Inicial**, **Impulso 24 meses**, **HypeSquad**... e mande mensagem direto
- 29 configurações: tamanho, espaçamento, limite, ordem, quais badges mostrar, velocidade de carregamento e mais
- **Português e inglês**: segue o idioma do Discord, ou escolha nas configurações
- Instalador automático para Windows

> Usa BetterDiscord? Pegue o **[lirenzzzin/BadgesPlus-BetterDiscord](https://github.com/lirenzzzin/BadgesPlus-BetterDiscord)**

---

## Instalação automática (Windows)

1. Clique em **Code → Download ZIP** nesta página e extraia o zip.
2. Dê dois cliques em **`install.bat`**.
3. Responda **S** quando ele perguntar alguma coisa.
4. No Vesktop, vá em **Configurações → Vencord → Plugins**, procure **BadgesPlus** e ative.

O instalador faz tudo sozinho, em português ou inglês conforme o idioma do Windows:

| Etapa | O que acontece |
|---|---|
| 1 | Confere se você tem **Git**, **Node.js** e **pnpm**. Se faltar algum, oferece instalar pelo `winget` |
| 2 | Baixa o código do Vencord em `Documentos\Vencord` (ou atualiza, se já existir) |
| 3 | Copia o plugin para `Documentos\Vencord\src\userplugins\badgesPlus` |
| 4 | Compila o Vencord com o plugin |
| 5 | Encontra o Vesktop (instalado ou portátil) e fecha ele, se estiver aberto |
| 6 | Configura o **Vencord Location** do Vesktop para a pasta compilada |
| 7 | Abre o Vesktop de novo |

Antes de mudar a configuração do Vesktop, o instalador salva uma cópia dela como `state.json.bak`.

> O `install.bat` também funciona sozinho: se você baixar só ele, o instalador baixa o resto do GitHub.

### Atualizar

Rode o **`install.bat`** de novo. Ele atualiza o Vencord e o plugin e compila tudo outra vez.

> ⚠️ **Não use o botão de atualizar da aba "Updater" do Vencord.** Ele troca a sua versão compilada pela oficial, que não tem o plugin.

### Desinstalar

Rode o **`uninstall.bat`**. O Vesktop volta a usar o Vencord oficial e o plugin é removido.

### Opções do instalador

Os dois scripts aceitam opções, por exemplo `install.bat -Lang pt`:

| Opção | O que faz |
|---|---|
| `-Lang en` / `-Lang pt` | Força o idioma (padrão: idioma do Windows) |
| `-VencordDir "C:\caminho"` | Usa outra pasta para o código do Vencord (padrão: `Documentos\Vencord`) |
| `-Yes` | Responde "sim" para todas as perguntas |
| `-SkipVesktop` | Só compila, não mexe no Vesktop (apenas no instalador) |

---

## Como usar

### Badges ao lado do nome

Depois de ativar o plugin, as badges aparecem sozinhas no chat e na lista de membros. Passe o mouse em cima para ver o nome.

- Badges como **HypeSquad, Caçador de Bugs, Apoiador Inicial e Desenvolvedor Ativo** aparecem na hora.
- **Nitro e Impulso** só existem no perfil completo da pessoa. O plugin carrega os perfis em segundo plano, um de cada vez, começando por quem está na tela. Por isso elas vão aparecendo aos poucos.

### Pesquisador de badges

1. Entre em um canal de qualquer servidor.
2. Clique no **ícone de Nitro** na barra do canal, ao lado de fixados e lista de membros.
3. Aparecem botões com todas as badges do servidor e quantas pessoas têm cada uma.
4. Clique numa badge para selecionar. Ela fica com **contorno verde** e aparece a lista de quem tem essa badge.
5. Selecione várias para combinar. Por padrão aparece só quem tem **todas**; dá para trocar para **qualquer uma** nas configurações.
6. Em cada pessoa do resultado:
   - clique no **nome ou na foto** para abrir o perfil;
   - clique no **balão de conversa** para abrir a DM com ela.

**Dicas**

- O Discord só carrega parte dos membros de servidores grandes. O pesquisador mostra "X membros carregados de Y". Rolar a lista de membros carrega mais gente.
- O link **"Carregar badges de N membros"** busca o perfil de quem falta, para encontrar Nitro e Impulso. Você vê quantos faltam e pode clicar em **Parar** a qualquer momento.

---

## Configurações

Em **Configurações → Vencord → Plugins → BadgesPlus** (ícone de engrenagem). Tudo muda na hora, sem reiniciar.

| Grupo | Opções |
|---|---|
| **Idioma** | Automático (segue o Discord) · English · Português |
| **Onde mostrar** | No chat · Na lista de membros · Nas suas próprias badges · Em bots |
| **Aparência** | Tamanho no chat · Tamanho na lista de membros · Espaço entre badges · Máximo de badges por pessoa · Mostrar "+N" quando passar do máximo · Ordem (igual ao Discord / Nitro primeiro / Nitro por último) · Texto ao passar o mouse (nome curto ou texto do Discord) |
| **Quais badges** | Nitro · Impulso · HypeSquad · Programas do Discord (Funcionário, Parceiro, Caçador de Bugs, Apoiador Inicial, Desenvolvedores...) · Nome antigo · Missões e Orbs · Outras |
| **Carregamento** | Carregar perfis automaticamente · Velocidade (Rápido 0,5s / Normal 1s / Seguro 2s / Muito seguro 4s) · Carregar perfil de bots |
| **Pesquisador** | Mostrar o botão · Combinar badges (todas / qualquer uma) · Carregar badges ao abrir · Botão de mensagem · Fechar o pesquisador ao abrir DM · Incluir bots · Máximo de resultados |

Algumas opções só aparecem quando a opção "mãe" está ligada. Por exemplo, o tamanho no chat só aparece se "Mostrar no chat" estiver ligado.

---

## Instalação manual

Se preferir fazer na mão, ou se não estiver no Windows:

```bash
git clone https://github.com/Vendicated/Vencord
cd Vencord
pnpm install --frozen-lockfile
```

1. Copie a pasta `badgesPlus` deste repositório para `Vencord/src/userplugins/`. Atenção: é **`userplugins`**, não `plugins`.
2. Compile:
   ```bash
   pnpm build
   ```
3. No Vesktop: **Configurações → Vesktop → Open Developer Settings → Vencord Location** e escolha a pasta `Vencord/dist`.
4. Feche o Vesktop **por completo** (ícone perto do relógio → Sair) e abra de novo.
5. Ative o **BadgesPlus** em **Configurações → Vencord → Plugins**.

No Discord oficial (sem Vesktop), em vez do passo 3 rode `pnpm inject`.

---

## Problemas comuns

**O plugin não aparece na lista de plugins**
- Rode o `install.bat` de novo e leia as mensagens. Se alguma etapa falhar, ela aparece em vermelho.
- Feche o Vesktop pelo ícone perto do relógio → **Sair**. Só fechar a janela não basta.

**O plugin sumiu depois de um tempo**
- Provavelmente o Vencord foi atualizado pela aba *Updater*. Rode o `install.bat` de novo.

**O botão de Nitro não aparece na barra do canal**
- Ele só aparece dentro de servidores, não em DMs.
- Confira se **"Botão de pesquisar badges"** está ligado nas configurações do plugin.
- Se mesmo assim não aparecer, o Discord pode ter mudado o código dele. Abra o console (`Ctrl+Shift+I`), procure erros com "BadgesPlus" e [abra uma issue](https://github.com/lirenzzzin/BadgesPlus/issues).

**As badges de Nitro/Impulso demoram para aparecer**
- É normal: o Discord entrega um perfil por vez. Se o Discord pedir para ir mais devagar, o plugin desacelera sozinho. Se demorar demais, use a velocidade **Normal**.

---

## Aviso

Mods de cliente como o Vencord vão contra os Termos de Serviço do Discord. Use por sua conta e risco. O plugin carrega perfis de forma lenta, respeita os limites do Discord e **nunca envia mensagens automaticamente**: o botão de mensagem só abre a conversa.

## Licença

[GPL-3.0](LICENSE), a mesma licença do Vencord.
