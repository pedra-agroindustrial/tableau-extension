# Vazão de água — Extensão Tableau v1.4.0

Viz Extension com tubo horizontal em corte e setas animadas, inspirada na referência de medição de vazão. O mostrador exibe o valor de entrada em litros: Valor 20 com referência 1200 exibe **20 L**. A razão 20/1200 (1,67%) controla apenas a velocidade da animação e as faixas de cor. A referência inicial é 1200 L e pode ser alterada.

## Recursos

- Dois estilos leves: **Esquemático** (padrão) e **Metálico**, ambos com fluxo dentro do tubo.
- Uma única camada animada por CSS. Sem filtros SVG, sombras borradas, partículas ou cálculos de animação por quadro em JavaScript.
- Quanto maior o percentual, mais rápido o fluxo. Em 0%, as setas param; sem dados, a água fica oculta. O preenchimento do tubo não representa nível de água.
- Acima de 100%, mostra o valor real em litros e mantém a velocidade visual máxima.
- Animação pausada enquanto as configurações estiverem abertas ou a página estiver oculta.
- Opções organizadas em grupos recolhíveis; não é necessário abrir os grupos para salvar os valores preservados.
- Valor em litros abaixo do tubo, título próximo à borda superior; título manual ou dinâmico por campo; campo Nome opcional abaixo do desenho. Título dinâmico nulo ou vazio oculta o título; sem campo dinâmico, título manual vazio usa o nome da medida.
- Máximo configurável, casas decimais, três tamanhos de fonte e ampliação/ajuste do desenho.
- Uma faixa de cor inicial, botão para adicionar até 10 faixas, cores personalizadas e limites de 0% a 500%.
- Paletas de tubulação, cores individuais para tubo, interior, reflexo, título e textos; a cor da água é definida pelas faixas, fundo branco/cinza/transparente/escuro.
- Controle de velocidade e opção para desligar a animação; respeita a preferência de movimento reduzido do sistema.
- Não precisa de Python ou serviço externo para funcionar no Tableau publicado. Só carrega os arquivos estáticos hospedados junto da extensão.

## Teste no Tableau Desktop

1. Extraia a pasta completa.
2. Execute `INICIAR-TESTE.bat`; ele inicia um servidor local usando o PowerShell já incluído no Windows. Deixe a janela aberta.
3. Na planilha do Tableau, escolha o tipo de marca **Extensão de visualização / Viz Extension**, adicione `Vazao-LOCAL.trex` e autorize a extensão local se solicitado.
4. Arraste uma medida numérica agregada para **Valor**. O cartão deve retornar um único registro/valor.
5. Ajuste **Referência de fluxo — 100% (L)**. Arraste campos textuais para **Título** e **Nome** se quiser títulos que mudem com os dados.
6. Abra **Configurar** para escolher o estilo do cano e editar cores, faixas, fontes, animação e fundo. Salve a configuração e salve/publique a pasta de trabalho para persistir as escolhas.

## Publicação

Hospede `index.html`, `app.js`, `style.css` e a pasta `vendor` em HTTPS. Edite `Vazao-PRODUCAO.trex` para trocar `https://SEU-SERVIDOR/tableau-vazao/index.html` pelo endereço real do `index.html`, depois adicione esse `.trex` ao Tableau. Para atualizar uma extensão hospedada, substitua os arquivos hospedados pelo conteúdo da nova versão e reabra a pasta de trabalho.

## Observação sobre os dados

A planilha precisa retornar uma única linha depois dos filtros. A medida em Valor deve ser numérica. A extensão não consulta o banco diretamente: ela lê o resultado que o Tableau já carregou da fonte de dados.

## Atualizar a versão anterior

Feche o servidor local antigo, substitua a pasta completa e execute novamente `INICIAR-TESTE.bat`. A porta continua sendo 8768. Use o novo `Vazao-LOCAL.trex` na planilha. Os estilos antigos são convertidos para Esquemático; configurações salvas de faixas, textos, fontes e fundo são mantidas quando a instância existente é recarregada. Ao remover e adicionar a extensão, pode ser necessário configurar novamente.

A versão 1.2.0 troca os estilos com jato externo pelo tubo em corte. Os arquivos JS/CSS e os manifests usam um identificador de versão para reduzir problemas de cache.

## Novidades da versão 1.3.0

- Mostrador em litros, sem converter o valor de entrada para porcentagem.
- Título, tubo e valor formam um conjunto centralizado; redimensionamento mantém os textos próximos da tubulação.
- Bolhas acompanham as setas na mesma camada CSS animada. A partir de 50% da referência aparecem bolhas adicionais. Opção para ocultá-las em Tamanho e ajuste.
- Bolhas são uma indicação visual do movimento do líquido; não são uma medição de pressão.
- Em 0, setas e bolhas param. Sem dados, o mostrador exibe um traço e o fluxo fica oculto.
- Faixas de cor continuam em porcentagem da referência: com referência 1200 L, o limite de 50% corresponde a 600 L.

## Novidades da versão 1.4.0

- Unidade editável no Configurar: L, mL, m³, L/s, m³/h, m³/L ou outro texto (até 24 caracteres). Vazio oculta a unidade. Configurações antigas recebem L automaticamente.
- A unidade é um rótulo: não há conversão automática. O valor e a referência precisam estar na mesma unidade.
- Mais bolhas em três grupos com movimentos verticais desencontrados, enquanto acompanham as setas na horizontal. O movimento vertical ganha intensidade conforme a vazão aumenta.
- O fluxo continua leve: três grupos CSS fazem a oscilação, sem animação individual de cada bolha. Em zero, com animação desativada, durante configuração ou com a página oculta, os movimentos ficam pausados.
