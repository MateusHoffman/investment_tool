# �� Documentação Detalhada - GetBestStocks.js

## 🎯 Objetivo
Este script automatiza a análise e filtragem de ações para identificar as melhores oportunidades de investimento baseadas em critérios específicos de dividendos, lucratividade e preço.

## 📋 Visão Geral do Processo
O script executa **7 etapas sequenciais** de filtragem, reduzindo gradualmente o universo de ações de **604** para **10** ações selecionadas, com tempo de execução aproximado de **17 segundos**.

## 🔧 Dependências e Configurações

### Bibliotecas Utilizadas
- **`fs/promises`**: Leitura assíncrona de arquivos JSON
- **`moment`**: Manipulação de datas e formatação
- **`moment-duration-format`**: Formatação de durações para exibição

### Arquivos de Dados
- **`data/allStocks.json`**: Base completa de ações com histórico de preços, dividendos e lucros
- **`data/allOptionTickers.json`**: Lista de ações que possuem opções disponíveis

### Configuração de Período
```javascript
const requiredYears = Array.from({ length: 10 }, (_, i) => obterAnoAnterior() - i);
```
- Analisa os **últimos 10 anos** de dados
- Exemplo: Se estamos em 2024, analisa de 2014 a 2023

## 📊 Etapas Detalhadas do Processo

### �� **1ª Etapa: Normalização e Limpeza de Dados**
**Entrada:** 604 ações  
**Saída:** 604 ações (normalizadas)

#### Processo:
1. **Histórico de Preços (`priceHistory`)**:
   - Converte datas do formato "DD/MM/YY HH:mm" para timestamp
   - Valida se o preço é numérico e a data é válida
   - Ordena por timestamp (mais recente primeiro)
   - Formata data para "DD/MM/YYYY"

2. **Histórico de Dividendos (`annualDividends`)**:
   - Extrai dados de `assetEarningsYearlyModels`
   - Valida se `rank` (ano) e `value` (valor) são numéricos
   - Ordena por ano (mais recente primeiro)

3. **Histórico de Lucro Líquido (`netProfitHistory`)**:
   - Inverte a ordem dos anos
   - Busca o valor de "LucroLiquido" na grade de dados
   - Valida se ano e lucro são numéricos
   - Ordena por ano (mais recente primeiro)

---

### �� **2ª Etapa: Filtro de Completude de Dados**
**Entrada:** 604 ações  
**Saída:** 131 ações

#### Critérios:
- **Dividendos**: Deve ter dados para todos os 10 anos analisados
- **Lucro Líquido**: Deve ter dados para todos os 10 anos analisados

#### Função de Validação:
```javascript
const hasAllRequiredYears = (arr, key, isDate = false) =>
  requiredYears.every((year) =>
    arr?.some((item) =>
      isDate
        ? moment(item[key], "DD/MM/YYYY").year() === year
        : item[key] === year
    )
  );
```

**Nota:** A validação de histórico de preços está comentada, mas poderia ser ativada para exigir dados de preço para todos os anos.

---

### �� **3ª Etapa: Filtro por Período Específico**
**Entrada:** 131 ações  
**Saída:** 131 ações (dados filtrados por período)

#### Processo:
- Filtra dividendos e lucros apenas para o período de 10 anos definido
- Remove dados fora do intervalo `[minYear, maxYear]`
- Mantém a estrutura dos dados, mas com menos registros

---

### �� **4ª Etapa: Filtro de Lucratividade**
**Entrada:** 131 ações  
**Saída:** 45 ações

#### Critérios Rigorosos:
1. **Lucro Positivo**: Todos os anos devem ter lucro líquido > 0
2. **Lucro Significativo**: 80% dos anos devem ter lucro ≥ R$ 500 milhões

#### Cálculo:
```javascript
const threshold = 500000000; // R$ 500 milhões
const countAboveThreshold = netProfitValues.filter(value => value >= threshold).length;
const percentageAboveThreshold = countAboveThreshold / netProfitValues.length;
return allPositive && percentageAboveThreshold >= 0.8;
```

**Objetivo:** Identificar empresas consistentemente lucrativas e de grande porte.

---

### �� **5ª Etapa: Filtro de Qualidade dos Dividendos**
**Entrada:** 45 ações  
**Saída:** 44 ações

#### Lógica:
- Identifica os **2 menores dividendos** da série histórica
- Identifica os **3 anos mais recentes** com dados
- **Rejeita** ações onde os 2 menores dividendos ocorreram nos 3 anos mais recentes

#### Objetivo:
Evitar empresas que podem estar reduzindo dividendos recentemente, indicando possível deterioração financeira.

---

### 🎯 **6ª Etapa: Cálculo de Métricas e Score**
**Entrada:** 44 ações  
**Saída:** 44 ações (com métricas calculadas)

#### Métricas Calculadas:

1. **Preço Atual**: Primeiro valor do histórico de preços
2. **Melhor Preço**: Baseado no 3º menor dividendo anual
   ```javascript
   const thirdLowestValue = sortedDivAnnualAscByValue[2].value;
   const ceilingPrice = thirdLowestValue / 0.06; // Taxa de 6%
   ```

3. **Distância entre Preços**: Percentual de diferença entre preço atual e melhor preço
4. **Possui Opções**: Verifica se a ação tem opções disponíveis
5. **Dividendo Esperado**: 
   - Atual: `thirdLowestValue / currentPrice`
   - Melhor: `thirdLowestValue / bestPrice`

6. **Score do Melhor Preço**: Algoritmo complexo que:
   - Gera lista de DYs de 6% a 50% (incrementos de 0.1%)
   - Calcula quantos anos tiveram dividendos acima de cada DY
   - Soma todos os scores para criar um ranking

#### Ordenação:
1. **Prioridade 1**: Ações com opções (primeiro)
2. **Prioridade 2**: Menor distância entre preços (menor diferença = melhor)

---

### 🏆 **7ª Etapa: Seleção Final**
**Entrada:** 44 ações  
**Saída:** 10 ações (TOP 10)

#### Processo:
- Seleciona as **10 primeiras ações** da lista ordenada
- Salva resultado em `debug/7.json`
- Exibe tempo total de execução

---

## �� Estrutura de Dados de Saída

### Formato Final de Cada Ação:
```json
{
  "ticker": "AÇÃO4",
  "currentPrice": 15.50,
  "currentDividend": 0.0452,
  "bestPrice": 12.80,
  "bestDividend": 0.0547,
  "distanceBetweenPrices": 17.42,
  "haveOptions": true,
  "scoreByBestPrice": 45
}
```

### Campos Explicados:
- **`ticker`**: Código da ação
- **`currentPrice`**: Preço atual da ação
- **`currentDividend`**: Dividend yield atual (baseado no 3º menor dividendo)
- **`bestPrice`**: Preço ideal para compra (baseado em DY de 6%)
- **`bestDividend`**: Dividend yield no preço ideal
- **`distanceBetweenPrices`**: Percentual de diferença entre preços
- **`haveOptions`**: Se a ação possui opções disponíveis
- **`scoreByBestPrice`**: Score calculado para o preço ideal

---

## 🎯 Critérios de Investimento

### Filosofia do Script:
1. **Consistência**: Empresas lucrativas por 10 anos consecutivos
2. **Tamanho**: Empresas com lucro mínimo de R$ 500 milhões
3. **Qualidade dos Dividendos**: Evita empresas com dividendos em queda
4. **Preço Atual vs. Ideal**: Prioriza ações próximas do preço ideal
5. **Liquidez**: Prioriza ações com opções disponíveis

### Taxa de Retorno Esperada:
- **DY Mínimo**: 6% (base para cálculo do preço ideal)
- **DY Máximo**: 50% (limite superior para análise)

---

## ⚡ Performance e Otimizações

### Tempo de Execução:
- **Total**: ~17 segundos
- **Processamento**: 604 → 10 ações em 7 etapas

### Otimizações Implementadas:
1. **Filtros Sequenciais**: Reduz progressivamente o dataset
2. **Validação Early**: Remove dados inválidos na primeira etapa
3. **Ordenação Eficiente**: Usa métodos nativos de array
4. **Processamento Assíncrono**: Leitura de arquivos não-bloqueante

---

## 🔧 Configurações Personalizáveis

### Parâmetros Ajustáveis:
- **Período de Análise**: Atualmente 10 anos (linha 33)
- **Threshold de Lucro**: Atualmente R$ 500 milhões (linha 139)
- **Taxa de DY Mínima**: Atualmente 6% (linha 175)
- **Taxa de DY Máxima**: Atualmente 50% (linha 189)
- **Quantidade Final**: Atualmente 10 ações (linha 270)

### Comentários de Debug:
- Cada etapa possui comentário para salvar arquivo JSON intermediário
- Útil para análise detalhada de cada filtro

---

## �� Notas de Implementação

### Tratamento de Erros:
- Validação de tipos numéricos
- Verificação de datas válidas
- Filtros null-safe com operador `?.`

### Estrutura de Dados:
- Uso de `moment.js` para manipulação de datas
- Ordenação consistente (mais recente primeiro)
- Normalização de formatos de dados

### Extensibilidade:
- Fácil adição de novos filtros
- Parâmetros configuráveis
- Estrutura modular para manutenção

---

## �� Como Executar

### Pré-requisitos:
```bash
npm install moment moment-duration-format
```

### Execução:
```bash
node GetBestStocks.js
```

### Saídas:
- **Console**: Contadores de cada etapa e tempo total
- **Arquivo**: `debug/7.json` com as 10 melhores ações

---

## 💡 Casos de Uso

### Ideal Para:
- **Investidores de Dividendos**: Foco em renda passiva
- **Análise Fundamentalista**: Baseada em dados financeiros reais
- **Screening de Ações**: Identificação rápida de oportunidades
- **Backtesting de Estratégias**: Dados históricos consistentes

### Limitações:
- Depende da qualidade dos dados de entrada
- Não considera análise técnica
- Foco apenas em critérios quantitativos
- Requer dados atualizados regularmente

---

*Documentação criada para facilitar o entendimento e manutenção do script GetBestStocks.js*