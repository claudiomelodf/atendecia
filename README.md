# AtendeCia Chat - Assistente de Vendas

Este é um aplicativo de chat web simples projetado para auxiliar vendedores da Cia da Informática a obter rapidamente informações sobre produtos usando um assistente de IA (OpenAI).

## Funcionalidades Principais

*   Interface de chat baseada na web.
*   Autenticação de usuário simples.
*   Integração com a API de Assistentes da OpenAI para buscar informações de produtos em um arquivo `produtos.json`.
*   Fallback para busca local no `produtos.json` caso a API OpenAI falhe ou não esteja configurada.
*   Exibição de imagens de produtos nas respostas do assistente (buscadas através de um proxy interno para evitar problemas de CORS).
*   Layout ajustado para limitar a altura do texto das respostas e adicionar barra de rolagem.
*   Botão para copiar facilmente o texto das respostas do assistente.
*   Opção para limpar o histórico de chat.

## Pré-requisitos

*   Node.js (versão 16 ou superior recomendada)
*   npm (geralmente instalado com o Node.js)
*   Acesso à API da OpenAI (chave de API e ID de um Assistente configurado)
*   Um servidor ou ambiente para hospedar a aplicação (ex: VPS Linux)

## Instalação

1.  **Clone o Repositório:**
    ```bash
    git clone <URL_DO_SEU_REPOSITORIO_GITHUB>
    cd <NOME_DO_DIRETORIO_CLONADO>
    ```

2.  **Instale as Dependências:**
    ```bash
    npm install
    ```
    Isso instalará Express, Sequelize, OpenAI, Axios, dotenv, bcrypt, express-session, connect-session-sequelize, etc.

## Configuração

1.  **Arquivo de Ambiente (`.env`):**
    *   Crie um arquivo chamado `.env` na raiz do projeto.
    *   Copie o conteúdo de `.env.example` (que será criado no próximo passo) para o `.env`.
    *   Preencha as variáveis no arquivo `.env`:
        *   `SESSION_SECRET`: Uma string secreta longa e aleatória para segurança da sessão.
        *   `OPENAI_API_KEY`: Sua chave de API da OpenAI.
        *   `ASSISTANT_ID`: O ID do seu Assistente OpenAI configurado.
        *   `ADMIN_EMAIL`: O email para a conta de administrador inicial.
        *   `ADMIN_PASSWORD`: A senha para a conta de administrador inicial.

2.  **Arquivo de Produtos (`produtos.json`):**
    *   Coloque o seu arquivo `produtos.json` (contendo os dados dos produtos) na **raiz do projeto**.
    *   Certifique-se de que o formato do JSON está correto.

3.  **Logo da Empresa:**
    *   Coloque o arquivo de logo da sua empresa em `src/public/images/informatica_logo.png` (ou ajuste o caminho no arquivo `src/views/chat.ejs` e `src/routes/chat.js`).

4.  **Configuração do Assistente OpenAI:**
    *   Acesse a plataforma OpenAI e configure um Assistente.
    *   Faça o upload do seu arquivo `produtos.json` para o Assistente.
    *   Habilite a ferramenta de `File Search` (ou `Retrieval`).
    *   **Instruções do Assistente:** Configure as instruções do assistente para que ele saiba como usar o arquivo `produtos.json` e como formatar as respostas, especialmente incluindo a URL da imagem no formato `📸 https://...` em uma linha separada antes dos outros detalhes. Consulte as instruções recomendadas fornecidas durante o desenvolvimento.
    *   Copie o ID do Assistente e coloque-o na variável `ASSISTANT_ID` no arquivo `.env`.

## Executando a Aplicação

1.  **Inicialização do Banco de Dados e Criação do Admin:**
    Na primeira vez que executar, a aplicação tentará sincronizar os modelos do banco de dados (criando a tabela de usuários e mensagens) e criar o usuário administrador definido no `.env`.

2.  **Iniciando o Servidor (Desenvolvimento):**
    ```bash
    node server.js
    ```
    A aplicação estará acessível em `http://localhost:3000` (ou a porta definida no `server.js`).

## Executando com PM2 (Produção)

O PM2 é um gerenciador de processos recomendado para manter sua aplicação Node.js rodando em produção.

1.  **Instale o PM2 globalmente (se ainda não o fez):**
    ```bash
    sudo npm install pm2 -g
    ```

2.  **Inicie a Aplicação com PM2:**
    Navegue até o diretório raiz do projeto e execute:
    ```bash
    pm2 start server.js --name atendecia-chat
    ```
    *   `--name atendecia-chat`: Define um nome para o processo no PM2.

3.  **Salve a Lista de Processos:**
    Para que o PM2 lembre dos seus processos após reinicializações:
    ```bash
    pm2 save
    ```

4.  **Configure o PM2 para Iniciar com o Sistema:**
    Para que o PM2 (e sua aplicação) iniciem automaticamente quando o servidor ligar:
    ```bash
    pm2 startup
    ```
    *   Este comando exibirá outro comando que você precisa copiar e executar (geralmente começando com `sudo env PATH=...`). Execute esse comando.

5.  **Monitorando com PM2:**
    *   Listar processos: `pm2 list`
    *   Ver logs: `pm2 logs atendecia-chat`
    *   Parar: `pm2 stop atendecia-chat`
    *   Reiniciar: `pm2 restart atendecia-chat`
    *   Remover: `pm2 delete atendecia-chat`

## Estrutura do Projeto (Simplificada)

```
/
├── .env             # Configurações (API Keys, etc.) - NÃO FAÇA COMMIT
├── .env.example     # Exemplo de arquivo .env
├── produtos.json    # Dados dos produtos - NÃO FAÇA COMMIT se for sensível
├── package.json     # Dependências do projeto
├── package-lock.json
├── server.js        # Ponto de entrada da aplicação
└── src/
    ├── models/      # Definições do Sequelize (User, ChatMessage)
    │   └── index.js
    ├── public/      # Arquivos estáticos (CSS, Imagens)
    │   ├── css/
    │   │   └── style.css
    │   └── images/
    │       └── informatica_logo.png
    ├── routes/      # Definições de rotas Express
    │   ├── auth.js  # Rotas de autenticação e middleware
    │   └── chat.js  # Rotas do chat e proxy de imagem
    └── views/       # Templates EJS
        ├── login.ejs
        └── chat.ejs
```

## Observações

*   **Segurança:** Certifique-se de que seu arquivo `.env` e `produtos.json` (se contiver informações sensíveis) não sejam enviados para o repositório Git público. Adicione-os ao seu arquivo `.gitignore`.
*   **Banco de Dados:** Esta versão utiliza SQLite por padrão (armazenado em `database.sqlite`), o que é simples para começar, mas pode não ser ideal para produção em larga escala. Considere configurar para PostgreSQL ou MySQL se necessário.
*   **Erros:** Verifique os logs do console (`node server.js`) ou do PM2 (`pm2 logs atendecia-chat`) para diagnosticar problemas.

