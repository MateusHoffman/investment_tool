import fs from "fs/promises";
import moment from "moment";
import "moment-duration-format";
import "moment-business-days";

moment.locale("pt-br");

const HISTÓRICO_DE_X_ANOS = 10;
const LUCRO_MINIMO_ACEITAVEL = 500000000;
const CHANCES_DE_EXERCICIO = [0.3];
const DATA_INICIAL = moment();
const DATA_FINAL = moment("23/05/2025", "DD/MM/YYYY");
const DIAS_UTEIS_ANUAL = 246;
const RENTABILIDADE_MENSAL_ESPERADA = 0.01;

const obterAnoAnterior = () => {
  const anoAtual = new Date().getFullYear();
  const anoAnterior = anoAtual - 1;
  return anoAnterior;
};

const requiredYears = Array.from(
  { length: HISTÓRICO_DE_X_ANOS },
  (_, i) => obterAnoAnterior() - i
);

const formatarAções = (ações) => {
  return ações.map((ação) => {
    const lucros = ação?.netProfitHistory?.grid
      ?.find((g) => g?.gridLineModel?.key === "LucroLiquido")
      ?.gridLineModel?.values?.slice(1);

    return {
      nome: ação.ticker,
      históricoDePreço: ação?.priceHistory?.map((preçoData) => ({
        preço: preçoData.price,
        date: moment(preçoData.date, "DD/MM/YY HH:mm"),
      })),
      históricoDeDividendoAnual:
        ação?.dividendHistory?.assetEarningsYearlyModels?.map((divData) => ({
          ano: divData.rank,
          valor: divData.value,
        })),
      históricoDeLucro: ação?.netProfitHistory?.years
        ?.reverse()
        ?.map((ano, index) => ({ ano: ano, lucro: lucros[index] })),
    };
  });
};

const filtrarAçõesComHistóricoDeXAnos = (ações) => {
  return ações
    .map((ação) => {
      const historicoDePrecoFiltrado = ação["históricoDePreço"];

      const historicoDeDividendoFiltrado = ação[
        "históricoDeDividendoAnual"
      ]?.filter((item) => requiredYears.includes(item.ano));

      const historicoDeLucroFiltrado = ação["históricoDeLucro"]?.filter(
        (item) => requiredYears.includes(item.ano)
      );

      if (
        historicoDePrecoFiltrado?.length === 0 &&
        historicoDeDividendoFiltrado?.length !== HISTÓRICO_DE_X_ANOS &&
        historicoDeLucroFiltrado?.length !== HISTÓRICO_DE_X_ANOS - 1
      ) {
        return null;
      }

      return {
        nome: ação.nome,
        históricoDePreço: historicoDePrecoFiltrado,
        históricoDeDividendoAnual: historicoDeDividendoFiltrado,
        históricoDeLucro: historicoDeLucroFiltrado,
      };
    })
    .filter((obj) => obj !== null);
};

const filtrarAçõesPorLucro = (ações) => {
  return ações.filter(
    (ação) =>
      !ação["históricoDeLucro"].some(
        (item) => item.lucro <= LUCRO_MINIMO_ACEITAVEL
      )
  );
};

const filtrarAçõesComOpções = (ações, allOptionTickers) => {
  return ações.filter((ação) => allOptionTickers.includes(ação.nome));
};

function createPricesObject(pricesArray, diasUteisAnual) {
  const result = {};
  const totalElements = pricesArray.length;

  for (let i = 1; i <= Math.ceil(totalElements / diasUteisAnual); i++) {
    result[i] = pricesArray.slice(0, diasUteisAnual * i);
  }

  return result;
}

function calcularMedia(array) {
  if (array.length === 0) {
    throw new Error("O array não pode estar vazio.");
  }

  const soma = array.reduce((acc, valor) => acc + valor, 0);
  return soma / array.length;
}

function getListVariation(array, periodo) {
  const variations = [];

  for (let index = periodo; index < array.length; index++) {
    const initialPrice = array[index].preço; // Preço inicial
    const finalPrice = array[index - periodo].preço; // Preço final

    // Cálculo da variação percentual
    const variation = ((finalPrice / initialPrice - 1) * 100).toFixed(2); // Arredonda para 2 casas decimais

    // Adiciona a variação ao array se não for NaN
    if (!isNaN(variation)) {
      variations.push(parseFloat(variation)); // Converte a string para número
    }
  }

  return variations;
}

function keepMostFrequentElements(array, percentile) {
  const sortedArray = array.slice().sort((a, b) => a - b);
  const lowerCount = Math.ceil(array.length * percentile);
  const upperCount = Math.ceil(array.length * percentile);

  // Remove os elementos menos frequentes
  return sortedArray
    .slice(lowerCount, array.length - upperCount)
    .map((num) => parseFloat(num.toFixed(2)));
}

function obterScoreByBestPrice(bestPrice, ação) {
  const listDy = Array.from(
    {
      length: (0.5 - 0.001) / 0.001 + 1,
    },
    (_, i) => parseFloat((0.5 - i * 0.001).toFixed(3))
  );

  const listMinDyAnnualByBestPrice = listDy.map((dy) =>
    parseFloat((dy * bestPrice).toFixed(3))
  );

  const listScoreByBestPrice = listMinDyAnnualByBestPrice
    .map(
      (minDy) =>
        ação["históricoDeDividendoAnual"].filter((div) => div.valor >= minDy)
          .length
    )
    .sort((a, b) => b - a);

  const scoreByBestPrice = listScoreByBestPrice.reduce(
    (acc, curr) => acc + curr,
    0
  );
  return scoreByBestPrice;
}

const obterRecomendaçõesPorChance = (ações, chance) => {
  const diasUteisEntreDatas = DATA_INICIAL.businessDiff(DATA_FINAL);
  let listaDeRecomendações = [];
  for (const ação of ações) {
    const preçosData = ação["históricoDePreço"];
    const preçosOrdenadoMaisRecente = preçosData.sort(
      (a, b) => b.date - a.date
    );

    const pricesObject = createPricesObject(
      preçosOrdenadoMaisRecente,
      DIAS_UTEIS_ANUAL
    );

    let arrayLower = [];

    // Calcula as variações e armazena os elementos mais frequentes
    for (const key in pricesObject) {
      const priceArray = pricesObject[key];
      const listVariation = getListVariation(priceArray, diasUteisEntreDatas);

      const mostFrequentElements = keepMostFrequentElements(
        listVariation,
        chance
      );

      if (mostFrequentElements.length) {
        arrayLower.push(mostFrequentElements[0]);
      }
    }

    const avgLower = calcularMedia(arrayLower);
    const putPegarStrikeAbaixeDe = (
      preçosOrdenadoMaisRecente[0].preço *
      (1 + avgLower / 100)
    ).toFixed(2);

    const scoreByBestPrice = obterScoreByBestPrice(
      putPegarStrikeAbaixeDe,
      ação
    );

    listaDeRecomendações.push({
      nome: ação.nome,
      putPegarStrikeAbaixeDe,
      pegarPrêmioAcimaDe:
        ((DATA_FINAL.diff(DATA_INICIAL, "days") + 1) *
          ((RENTABILIDADE_MENSAL_ESPERADA * 12) / 365) *
          (100 * putPegarStrikeAbaixeDe)) /
        100,
      rentabilidadeDiária: null,
      scoreDyNoStrike: scoreByBestPrice,
    });
  }
  return listaDeRecomendações.sort(
    (a, b) => b.scoreDyNoStrike - a.scoreDyNoStrike
  );
};

(async () => {
  const allStocks = JSON.parse(
    await fs.readFile("data/allStocks.json", "utf-8")
  );
  const allOptionTickers = JSON.parse(
    await fs.readFile("data/opçõesDaClear.json", "utf-8")
  );

  const açõesFormatadas = formatarAções(allStocks);
  console.log(açõesFormatadas.length);
  const açõesComHistóricoDeXAnos =
    filtrarAçõesComHistóricoDeXAnos(açõesFormatadas);
  console.log(açõesComHistóricoDeXAnos.length);
  const açõesComLucro = filtrarAçõesPorLucro(açõesComHistóricoDeXAnos);
  console.log(açõesComLucro.length);
  const açõesComOpção = filtrarAçõesComOpções(açõesComLucro, allOptionTickers);
  console.log(açõesComOpção.length);
  // console.log(açõesComOpção.map(e => e.nome))
  // console.log(açõesComOpção.find(e => e.nome === 'CIEL3'))

  let listaDeRecomendações = {};

  for (const chance of CHANCES_DE_EXERCICIO) {
    const recomendaçõesPorChance = obterRecomendaçõesPorChance(
      açõesComOpção,
      chance
    );
    listaDeRecomendações = {
      ...listaDeRecomendações,
      [chance]: recomendaçõesPorChance.slice(0, 3),
    };
  }
  console.log(listaDeRecomendações);
})();
