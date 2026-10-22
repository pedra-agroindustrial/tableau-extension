# Piscina percentual para Tableau

Extensão de visualização para Tableau: mostra uma piscina enchendo conforme uma medida agregada da planilha. A superfície da água tem uma onda animada suave, e a altura acompanha o percentual. O desenho se redimensiona automaticamente ao espaço disponível na planilha ou no dashboard. Em Configurar, ajuste a ampliação (90% a 125%), escolha entre manter a proporção ou preencher toda a área, e personalize separadamente as fontes do título, do percentual e do nome da piscina. A paleta do desenho e as cores da estrutura, do interior, das bordas e dos textos também podem ser configuradas; o fundo transparente continua disponível. O padrão amplia o desenho para 120% e mantém a proporção; em áreas pequenas, reduz os espaços e o texto auxiliar. A piscina enche até **100%** e começa a transbordar acima desse valor. Não há capacidade máxima para configurar nem quantidade/capacidade mostrada na parte inferior.

A cor do líquido usa uma faixa vermelha de 0% a 100% por padrão. Em Configurar, use **+ Adicionar faixa** para criar até 10 faixas; escolha a cor e o limite final de cada uma. O início acompanha o limite da anterior. O limite final começa em 100%, mas pode ser elevado até 500% para classificar valores maiores. A piscina enche aos 100% e começa a transbordar acima desse valor. As moscas animadas foram removidas desta versão. A tubulação lateral foi removida.

## Instalação

Requer Tableau 2024.2 ou posterior com Viz Extensions habilitadas.

1. Extraia o ZIP mantendo as pastas.
2. Para teste local, execute `INICIAR-TESTE.bat` (requer Python 3 apenas para servir os arquivos localmente na porta 8767).
3. No Tableau, adicione `Piscina-LOCAL.trex` pela **planilha > cartão Marcas > seletor do tipo de marca > Extensões de visualização / Viz Extensions > Adicionar extensão > Acessar extensões locais**. Não use o objeto Extensão do dashboard.
4. Arraste uma medida numérica agregada para a entrada **Valor** no cartão Marcas. O campo deve retornar um percentual de 0 a 100 (por exemplo, 52,4 para exibir 52,4%). Se a medida retornar fração decimal, como 0,524, multiplique por 100 em um cálculo do Tableau.
5. Opcionalmente, arraste campos para **Título**, **Nome** e **Limite faixa 1** no cartão Marcas. Título e Nome aceitam texto; Limite faixa 1 aceita número, por exemplo 60. Esses campos atualizam a visualização com os valores do registro filtrado e substituem os valores correspondentes salvos em Configurar. Se a entrada Título estiver sem campo e o título manual estiver vazio, é exibido o nome da medida usada em Valor. Se houver um campo na entrada Título e ele retornar nulo ou vazio, o título fica oculto. Sem os campos, são usadas as configurações manuais. O campo Empresa pode ser colocado em Título e Nome para exibir o mesmo texto nos dois lugares.
6. Clique em **Configurar** para adicionar ou remover faixas, ajustar cores e limites, casas decimais, fundo, ampliação e modo de ajuste da piscina, além dos tamanhos das fontes. Com duas ou mais faixas, o campo dinâmico Limite faixa 1 substitui o fim da primeira e precisa ser maior que 0 e menor que o fim da segunda. Com apenas uma faixa, esse campo não altera a cor. Salve a configuração e a pasta de trabalho.
7. Coloque a planilha no dashboard.

É esperado um único registro/resultado para todos os campos usados. A extensão lê Valor, Título, Nome e Limite faixa 1 da mesma linha após os filtros Tableau. Se houver mais de uma linha, ela mostra um aviso e não escolhe nem agrega um registro por conta própria. Se o texto do título ou nome mudar no banco, o painel acompanha a alteração na próxima atualização dos dados.

## Configurações de cor

Cada faixa tem cor própria e limite final configurável; o início acompanha automaticamente o limite anterior. O primeiro limite de cor começa em 100%, mas pode ser aumentado até 500%. Com várias faixas, a entrada dinâmica **Limite faixa 1** pode substituir o limite da primeira faixa. O desenho da água enche até 100% e transborda acima disso; o percentual real continua visível. Valores negativos mostram a piscina vazia.

## Publicação

1. Hospede `index.html`, `app.js`, `style.css` e `vendor/` em servidor HTTPS acessível pelos visualizadores.
2. Em `Piscina-PRODUCAO.trex`, substitua a URL de exemplo pelo endereço hospedado e atualize contato/organização.
3. Verifique se a página pode ser carregada em iframe pelo Tableau (CSP `frame-ancestors`, `X-Frame-Options` e liberação da URL pelo administrador).
4. Use o manifesto de produção no cartão Marcas e publique a pasta de trabalho.

Python não é necessário em produção se os arquivos estiverem num servidor estático HTTPS. O arquivo `.trex` aponta para a aplicação; não embute os arquivos.

## Atualização dos dados

A extensão lê os campos resumidos da planilha e reage ao evento `SummaryDataChanged`. Ela não consulta o banco diretamente nem atualiza extrações. A atualização da conexão/fonte de dados deve estar configurada no Tableau ou no processo que mantém essa fonte atualizada.

Zero mostra 0% e piscina vazia. Nulo, ausência de dados ou erro mostram travessão e aviso. A leitura usa dados resumidos da planilha, libera o leitor após cada consulta e não envia dados a terceiros. A biblioteca Tableau incluída em `vendor/` é carregada localmente, sem CDN em tempo de execução.

## Arquivos de prévia

`PREVIA-EXEMPLO.png` e `PREVIA-EXEMPLO.svg` mostram um exemplo visual fixo de 56,9%; eles não fornecem os dados da extensão.


**Fundo transparente:** em Configurar, selecione **Transparente** e clique em **Salvar configuração**. A extensão passa a revelar a cor de fundo definida na planilha ou no dashboard; se essa área estiver cinza, o fundo visível também será cinza.
