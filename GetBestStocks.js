// 1º 604
// 2º 131
// 3º 131
// 4º 45
// 5º 44
// 6º 44
// 7º 5
// 17 s 081 ms
import fs from "fs/promises";
import moment from "moment";
import "moment-duration-format";

(async () => {
  const startTime = performance.now();

  const allStocks = JSON.parse(
    await fs.readFile("data/allStocks.json", "utf-8")
  );
  const allOptionTickers = JSON.parse(
    await fs.readFile("data/allOptionTickers.json", "utf-8")
  );
  // .filter((e) => e.ticker === "CMIG4");
  // .slice(0, 5);

  let stocks = allStocks;

  const requiredYears = Array.from({ length: 10 }, (_, i) => 2023 - i);
  const minYear = Math.min(...requiredYears);
  const maxYear = Math.max(...requiredYears);

  const hasAllRequiredYears = (arr, key, isDate = false) =>
    requiredYears.every((year) =>
      arr.some((item) =>
        isDate
          ? moment(item[key], "DD/MM/YYYY").year() === year
          : item[key] === year
      )
    );

  // 1º
  stocks = stocks.map((e) => {
    const priceHistory = e.priceHistory
      .map(({ price, date }) => {
        const formattedDate = moment(date, "DD/MM/YY HH:mm");
        if (
          typeof price !== "number" ||
          !formattedDate.isValid() ||
          isNaN(formattedDate.valueOf())
        ) {
          return null;
        }

        return {
          value: price,
          date: formattedDate.format("DD/MM/YYYY"),
          timestamp: formattedDate.valueOf(),
        };
      })
      .filter((item) => item !== null)
      .sort((a, b) => b.timestamp - a.timestamp);

    const annualDividends = e.dividendHistory.assetEarningsYearlyModels
      .map(({ rank, value }) => {
        if (typeof rank !== "number" || typeof value !== "number") {
          return null;
        }
        return { year: rank, value: value };
      })
      .filter((item) => item !== null)
      .sort((a, b) => b.year - a.year);

    const netProfitHistory = e.netProfitHistory.years
      .reverse()
      .map((year, index) => {
        const lucroLiquido = e.netProfitHistory.grid.find(
          (g) => g?.gridLineModel?.key === "LucroLiquido"
        )?.gridLineModel?.values[index + 1];

        if (typeof year !== "number" || typeof lucroLiquido !== "number") {
          return null;
        }
        return { year, value: lucroLiquido };
      })
      .filter((item) => item !== null)
      .sort((a, b) => b.year - a.year);

    return {
      ticker: e.ticker,
      priceHistory,
      dividendHistory: { annualDividends },
      netProfitHistory,
    };
  });
  console.log("1º", stocks.length);
  // await fs.writeFile("debug/1.json", JSON.stringify(stocks, null, 2));

  // 2º
  stocks = stocks.filter((stock) => {
    // const hasValidPriceHistory = hasAllRequiredYears(
    //   stock.priceHistory,
    //   "date",
    //   true
    // );
    const hasValidDividends = hasAllRequiredYears(
      stock.dividendHistory.annualDividends,
      "year"
    );
    const hasValidNetProfit = hasAllRequiredYears(
      stock.netProfitHistory,
      "year"
    );

    return hasValidDividends && hasValidNetProfit;
    // return hasValidPriceHistory && hasValidDividends && hasValidNetProfit;
  });
  console.log("2º", stocks.length);
  // await fs.writeFile("debug/2.json", JSON.stringify(stocks, null, 2));

  // 3º
  stocks = stocks.map((item) => ({
    ticker: item.ticker,
    priceHistory: item.priceHistory,
    dividendHistory: {
      annualDividends: item.dividendHistory.annualDividends.filter(
        (dividend) => dividend.year >= minYear && dividend.year <= maxYear
      ),
    },
    netProfitHistory: item.netProfitHistory.filter(
      (profit) => profit.year >= minYear && profit.year <= maxYear
    ),
  }));
  console.log("3º", stocks.length);
  // await fs.writeFile("debug/3.json", JSON.stringify(stocks, null, 2));

  // 4º
  stocks = stocks.filter((stock) => {
    const netProfitValues = stock.netProfitHistory.map(
      (profit) => profit.value
    );
    const allPositive = netProfitValues.every((value) => value > 0);
    const threshold = 500000000;
    const countAboveThreshold = netProfitValues.filter(
      (value) => value >= threshold
    ).length;
    const percentageAboveThreshold =
      countAboveThreshold / netProfitValues.length;
    return allPositive && percentageAboveThreshold >= 0.8;
  });
  console.log("4º", stocks.length);
  // await fs.writeFile("debug/4.json", JSON.stringify(stocks, null, 2));

  // 5º
  stocks = stocks.filter((stock) => {
    const annualDividends = stock.dividendHistory.annualDividends;
    const sortedDividends = annualDividends.sort((a, b) => a.value - b.value);
    const twoSmallestDividends = sortedDividends.slice(0, 2);
    const smallestYears = twoSmallestDividends.map((dividend) => dividend.year);
    const recentYears = [
      ...new Set(annualDividends.map((dividend) => dividend.year)),
    ]
      .sort((a, b) => b - a)
      .slice(0, 3);
    const areBothRecent = smallestYears.every((year) =>
      recentYears.includes(year)
    );
    return !areBothRecent;
  });
  console.log("5º", stocks.length);
  // await fs.writeFile("debug/5.json", JSON.stringify(stocks, null, 2));

  // 6º
  stocks = stocks
    .map((stock) => {
      // Preço atual
      const currentPrice = stock.priceHistory[0].value;

      // Melhor preço
      const sortedDivAnnualAscByValue =
        stock.dividendHistory.annualDividends.sort((a, b) => a.value - b.value);
      const thirdLowestValue = sortedDivAnnualAscByValue[2].value;
      const ceilingPrice = thirdLowestValue / 0.06;
      let bestPrice = null;
      if (ceilingPrice > currentPrice) {
        bestPrice = +currentPrice.toFixed(2);
      }
      if (ceilingPrice <= currentPrice) {
        bestPrice = +ceilingPrice.toFixed(2);
      }

      // Distancia entre preços
      const distanceBetweenPrices = parseFloat(
        (((currentPrice - bestPrice) / currentPrice) * 100).toFixed(2)
      );

      // Possui opções
      const haveOptions = allOptionTickers.includes(stock.ticker);

      // Dividendo esperado atual e o melhor
      const currentDividend = +(thirdLowestValue / currentPrice).toFixed(5);
      const bestDividend = +(thirdLowestValue / bestPrice).toFixed(2);

      // Score do melhor preço
      const scoreByBestPrice = (() => {
        const listDy = Array.from(
          {
            length: (0.5 - 0.06) / 0.001 + 1,
          },
          (_, i) => parseFloat((0.5 - i * 0.001).toFixed(3))
        );

        const listMinDyAnnualByBestPrice = listDy.map((dy) =>
          parseFloat((dy * bestPrice).toFixed(3))
        );

        const listScoreByBestPrice = listMinDyAnnualByBestPrice
          .map(
            (minDy) =>
              stock.dividendHistory.annualDividends.filter(
                (div) => div.value >= minDy
              ).length
          )
          .sort((a, b) => b - a);

        const scoreByBestPrice = listScoreByBestPrice.reduce(
          (acc, curr) => acc + curr,
          0
        );
        return scoreByBestPrice;
      })();

      return {
        ticker: stock.ticker,
        currentPrice,
        currentDividend,
        bestPrice,
        bestDividend,
        distanceBetweenPrices,
        haveOptions,
        scoreByBestPrice,
      };
    })
    .sort((a, b) => {
      if (a.haveOptions && !b.haveOptions) {
        return -1; // a fica antes de b
      } else if (!a.haveOptions && b.haveOptions) {
        return 1; // b fica antes de a
      }

      // if (a.scoreByBestPrice > b.scoreByBestPrice) {
      //   return -1;
      // } else if (a.scoreByBestPrice < b.scoreByBestPrice) {
      //   return 1;
      // }

      if (a.distanceBetweenPrices < b.distanceBetweenPrices) {
        return -1;
      } else if (a.distanceBetweenPrices > b.distanceBetweenPrices) {
        return 1;
      }

      return 0;
    });
  console.log("6º", stocks.length);
  // await fs.writeFile("debug/6.json", JSON.stringify(stocks, null, 2));

  // 7º
  stocks = stocks.slice(0, 5);
  console.log("7º", stocks.length);
  await fs.writeFile("debug/7.json", JSON.stringify(stocks, null, 2));

  const endTime = performance.now();
  const formattedTime = moment
    .duration(endTime - startTime)
    .format("m [min] s [s] SSS [ms]");
  console.log(`Total execution time: ${formattedTime}`);
})();
