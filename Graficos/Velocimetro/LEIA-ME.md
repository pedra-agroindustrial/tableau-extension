# Velocímetro monocromático para Tableau — v1.3.18

## O que faz

Um velocímetro semicircular monocromático, com arco que se preenche conforme a medida, escala percentual de 0 a 100 e ponteiro animado. O mínimo é zero, o máximo padrão é 100 e a medida percentual entra em **Valor**. O ponteiro acompanha mudanças dos dados, filtros e atualizações da fonte. Tem temas claro/escuro, título dinâmico, uma segunda informação ligada a campo, casas decimais, ampliação, modo de ajuste e tamanhos de fonte configuráveis. O valor e a informação foram reposicionados mais acima; a unidade % pode ser ocultada nas configurações. Uma linha abaixo pode exibir outro campo do Tableau. O ponteiro fica estável em 0 e, acima de 0, faz uma oscilação sutil; quando a medida diminui, retorna com uma transição suave de aproximadamente 750 ms. A oscilação respeita a preferência do sistema por movimento reduzido.

O máximo é um parâmetro de configuração da extensão, não um parâmetro nativo do Tableau vinculado à fonte. Ele fica salvo como número na planilha e não muda com os dados. Os controles ficam ocultos no modo de visualização; um autor com permissão de editar ainda pode alterá-lo.

## Compatibilidade e instalação

Requer Tableau 2024.2 ou posterior com Viz Extensions habilitadas. É uma extensão de VISUALIZAÇÃO, adicionada pelo cartão Marcas de uma planilha. Não é adicionada pelo objeto Extensão do dashboard.

1. Extraia o ZIP.
2. Para teste local, execute INICIAR-TESTE.bat com Python 3 instalado. A porta é 8768, exclusiva para o velocímetro e diferente da piscina (8767) e da atualização TV (8765). Mantenha a janela aberta. Pode usar outro servidor estático; Python serve apenas para teste.
3. Crie uma planilha conectada à sua fonte.
4. No cartão **Marcas**, abra o seletor de tipo de marca > **Extensões de visualização / Viz Extensions > Adicionar extensão > Acessar extensões locais**. Selecione **Velocimetro-LOCAL.trex**.
5. A configuração abre no primeiro uso. Informe o máximo, por exemplo 200. O valor deve ser maior que zero. Aceita 1500,5 ou 1500.5, sem separador de milhares.
6. Escolha título/decimais/tema, ajuste a ampliação e o modo de encaixe, e defina as fontes do título, do valor e da unidade/informação. Clique **Salvar configuração** e depois **Fechar**.
7. Arraste uma medida para **Valor** no cartão Marcas. Opcionalmente, arraste um campo para **Título** para atualizar o título pelo banco; um resultado nulo ou vazio (`""`) oculta o título. Arraste um segundo campo para **Informação** para exibir seu conteúdo abaixo do valor e da unidade; nulo ou vazio oculta essa linha. Escolha a agregação adequada no Tableau: SUM, AVG, MIN, MAX ou cálculo agregado.
8. Mantenha um único valor agregado. Não adicione dimensões em Detalhe/Linhas/Colunas que criem várias marcas. A extensão avisa quando há várias marcas, em vez de somar percentuais ou médias indevidamente.
9. Adicione essa planilha ao dashboard. Cada planilha pode ter seu próprio velocímetro e máximo.
10. Salve a pasta de trabalho. Para alterar o máximo, use **Configurar** no gráfico em modo de edição ou **Formatar extensão** no cartão Marcas.

## Publicação

Se estiver atualizando uma instalação anterior, substitua no servidor os arquivos index.html, style.css e app.js (e mantenha vendor/tableau.extensions.js). Depois feche e reabra a pasta de trabalho; se o Tableau continuar mostrando o arco antigo, remova a extensão da planilha e adicione o Velocimetro-PRODUCAO.trex atualizado. Na atualização, as medidas que ainda estavam nos comprimentos padrão antigos migram para os novos comprimentos analógicos; comprimentos personalizados são mantidos. A revisão 1.3.18 usa URLs versionadas para CSS e JavaScript, evitando o cache dos arquivos anteriores. O desenho permite escolher os estilos moderno semicircular, minimalista, analógico clássico ou analógico realista (com mostrador circular inspirado na referência v1.3.2); paletas monocromática, azul, verde, laranja, violeta, ponteiro vermelho e personalizada também estão disponíveis, com controles independentes para as cores do arco, ponteiro, marcas, rótulos e valor. Os comprimentos e posições dos traços principais e menores são ajustáveis de forma independente; cada grupo pode ser ocultado separadamente ou ambos podem ser ocultados. Para cada grupo, é possível escolher linha padrão, fina, grossa ou pontos. O padrão analógico usa três comprimentos de traço, com pontas quadradas; os intermediários e curtos seguem os controles do grupo menor. O estilo realista mantém um pivô central maior e dois marcadores laterais. A posição pode ser deslocada até 24 px para dentro ou para fora do arco. Os traços pequenos ficam no lado interno do arco, começando junto à borda interna para não parecerem flutuantes. O fundo pode ser branco, cinza claro, transparente ou escuro. O arco preenchido também pode usar faixas de cor por percentual do máximo. O desenho semicircular usa percentual por padrão, com máximo inicial de 100 e unidade %. Os rótulos principais do arco exibem %; a unidade abaixo do valor pode ser ocultada em Configurar. No semicircular, os rótulos principais são 0%, 25%, 50%, 75% e 100%; no analógico realista, aparecem de 10 em 10%. O máximo continua ajustável nas configurações. Um campo na entrada **Informação** aparece numa linha abaixo do valor. O desenho semicircular tem arco configurável de 50% a 80% da circunferência, com 70% por padrão. O ponteiro, a escala e o preenchimento acompanham o ângulo escolhido. Também aceita um campo na entrada **Título** do cartão Marcas; se o campo retornar nulo ou `""`, o título fica oculto. Sem campo em Título, usa-se o título manual e, se ele estiver vazio, o nome da medida.

Hospede index.html, style.css, app.js e vendor/ em HTTPS acessível aos visualizadores. Não há backend próprio, banco adicional ou CDN em tempo de execução. Altere a URL em Velocimetro-PRODUCAO.trex para o endereço real do index.html. Os metadados suporte@example.com e https://example.com são exemplos: substitua pelo contato e site internos.

O servidor precisa permitir o carregamento em iframe pela origem do Tableau (verifique X-Frame-Options e CSP frame-ancestors). Habilite/libere a URL da extensão no Tableau Server/Cloud conforme as configurações do ambiente.

Use o manifesto de produção na planilha, configure e salve o máximo, e publique a pasta de trabalho. Ao trocar de manifesto pode ser necessário mapear novamente a medida e configurar novamente o máximo. Confirme no painel publicado que o máximo salvo reaparece e que Configurar está oculto para visualização.

Localhost só funciona na máquina onde o servidor local está rodando. A hospedagem HTTPS continua necessária em produção; o .trex apenas aponta para ela.

## Regras dos dados

- Entrada é o valor numérico bruto da medida já agregada pelo Tableau. Não converte texto em número e não faz uma segunda agregação.
- Zero é um valor válido. Nulos, ausência de linhas ou erro mostram travessão, não um zero fictício.
- Acima do máximo, o ponteiro para no fim; o número real continua visível e há aviso. Abaixo de zero, para no início e mostra o valor negativo com aviso.
- A extensão espera o percentual já calculado entre 0 e 100. Para uma medida que retorna 0,75, crie no Tableau um cálculo multiplicado por 100. O máximo padrão é 100, mas pode ser alterado nas configurações.
- A escala não depende do maior valor encontrado na fonte.
- Configuração só é gravada em modo de edição. Após salvar na extensão, salve/publique a pasta de trabalho.
- Esta extensão não faz consultas periódicas nem refresh de extrações. Ela reage a mudanças dos dados da planilha. Pode coexistir com a extensão de atualização de fontes já criada, desde que a fonte do velocímetro esteja no dashboard atualizado.
- Usa somente dados resumidos da planilha. Não requer permissão full data e não envia dados a terceiros.

## Validação

Nesta versão foram verificados a sintaxe do JavaScript, os manifestos como XML, o SVG, os IDs e as referências dos controles. A instalação no Tableau e o comportamento visual final ainda precisam ser conferidos no seu ambiente.

## Validação no seu ambiente

Teste com máximo 200 e medida 0, 100 e 200: ponteiro deve ficar à esquerda, no topo e à direita; em 0 deve ficar parado, acima de 0 deve oscilar levemente e, ao reduzir o valor, o ponteiro deve descer com uma transição breve visível. Teste filtros, valor acima do máximo, nulo e visualização após publicar. A integração real ainda depende de teste no seu Tableau; não houve acesso à sua instalação.

## Referências

https://tableau.github.io/extensions-api/docs/vizext/trex_viz_getstarted/
https://tableau.github.io/extensions-api/docs/vizext/trex_viz_manifest/
https://tableau.github.io/extensions-api/docs/trex_release-notes/
https://tableau.github.io/extensions-api/api/interfaces/Settings.html

A biblioteca oficial Tableau em vendor foi reaproveitada do pacote anterior, obtido do repositório oficial em 13/10/2026; preserve seus avisos de licença. O desenho e a lógica do velocímetro estão em SVG/CSS/JavaScript sem biblioteca gráfica externa.


**Fundo transparente:** em Configurar > **Fundo do velocímetro**, selecione **Transparente** e salve. A cor mostrada será a do fundo da planilha ou do dashboard atrás da extensão.

Na configuração de **Tamanho e ajuste**, a posição dos números principais da escala pode ser movida até 24 px para dentro ou para fora. Em **Design e cores > Personalizada**, a cor dos números pode ser definida separadamente da cor dos traços e dos demais textos.


A versão 1.3.18 aplica os tamanhos de fonte dos elementos SVG e permite escolher separadamente as cores do título, do valor principal, dos números da escala e dos traços/informações.
