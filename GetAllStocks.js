// 6 mins 6 s 669 ms
import fs from "fs/promises"; // Importa o módulo fs para manipulação de arquivos
import moment from "moment";
import "moment-duration-format";

const MAX_CONCURRENT_REQUESTS = 1; //https://www.conventionalcommits.org/en/v1.0.0/
const cache = new Map();

async function fetchAPI(url, options) {
  const maxAttempts = 999;
  const backoffTime = 1000; // 1 segundo
  let attempt = 0;

  while (attempt < maxAttempts) {
    try {
      const response = await fetch(url, options);

      if (response.ok) {
        return await response.json();
      } else {
        if (response.status === 429) {
          const cooldown = 3000 + attempt * 1000; // 3 segundos + 1 segundo por tentativa
          await new Promise((resolve) => setTimeout(resolve, cooldown));
          attempt++;
          continue; // Tentar novamente
        }

        if (response.status >= 500 && attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, backoffTime));
        }

        throw new Error(`Error on request to ${url}: ${response.statusText}`);
      }
    } catch (error) {
      if (attempt < maxAttempts - 1) {
        const jitter = Math.random() * 100; // Jitter aleatório entre 0-100ms
        const delay = backoffTime * Math.pow(2, attempt) + jitter;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      attempt++;
    }
  }
  throw new Error(`Failed to fetch ${url} after ${maxAttempts} attempts`);
}

// Funções de Fetch permanecem inalteradas...
export async function fetchTickers() {
  try {
    const url =
      "https://statusinvest.com.br/category/advancedsearchresultpaginated?search=%7B%22Sector%22%3A%22%22%2C%22SubSector%22%3A%22%22%2C%22Segment%22%3A%22%22%2C%22my_range%22%3A%22-20%3B100%22%7D&take=800&CategoryType=1";
    const headers = { "User-Agent": "Mozilla" };

    const response = await fetchAPI(url, { method: "GET", headers });
    const tickersSet = new Set(response.list.map((item) => item.ticker));
    return [...tickersSet];
  } catch (error) {
    throw error;
  }
}

export async function fetchPriceHistory(ticker) {
  try {
    const url = "https://statusinvest.com.br/acao/tickerpricerange";
    const headers = { "User-Agent": "Mozilla" };
    const body = new URLSearchParams({
      ticker,
      start: "1000-01-01",
      end: "3000-01-01",
    });

    const response = await fetchAPI(url, { method: "POST", headers, body });
    return response?.data[0]?.prices || [];
  } catch (error) {
    throw error;
  }
}

export async function fetchDividendHistory(ticker) {
  try {
    const url = `https://statusinvest.com.br/acao/companytickerprovents?ticker=${ticker}&chartProventsType=2`;
    const headers = { "User-Agent": "Mozilla" };
    const response = await fetchAPI(url, { method: "GET", headers });
    return response || [];
  } catch (error) {
    throw error;
  }
}

export async function fetchNetProfitHistory(ticker) {
  try {
    const url = `https://statusinvest.com.br/acao/getdre?code=${ticker}&type=0&futureData=false&range.min=1000&range.max=3000`;
    const headers = { "User-Agent": "Mozilla" };
    const response = await fetchAPI(url, { method: "GET", headers });
    return response?.data || [];
  } catch (error) {
    throw error;
  }
}

async function withConcurrencyLimit(tasks, limit) {
  const results = [];
  const executing = new Set();

  for (const task of tasks) {
    const promise = task().then((result) => {
      executing.delete(promise);
      return result;
    });

    results.push(promise);
    executing.add(promise);

    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }

  // Esperar que todas as promessas terminem
  return Promise.allSettled(results);
}

(async () => {
  const startTime = performance.now();
  // const allTickers = await fetchTickers();

  //ATUALIZAR MANUALMENTE A CADA 30 DIAS
  const allTickers = JSON.parse(
    await fs.readFile("data/allTickers.json", "utf-8")
  );

  const allStocksData = await withConcurrencyLimit(
    allTickers.map((ticker, index) => async () => {
      const cachedData = cache.get(ticker);
      if (cachedData) return cachedData;

      const [priceHistory, dividendHistory, netProfitHistory] =
        await Promise.all([
          fetchPriceHistory(ticker),
          fetchDividendHistory(ticker),
          fetchNetProfitHistory(ticker),
        ]);

      const results = {
        ticker,
        priceHistory: priceHistory || [],
        dividendHistory: dividendHistory || [],
        netProfitHistory: netProfitHistory || [],
      };

      cache.set(ticker, results);

      // Log progress
      console.log(`Processed ${index + 1}/${allTickers.length}: ${ticker}`);
      return results;
    }),
    MAX_CONCURRENT_REQUESTS
  );

  const endTime = performance.now();
  const fulfilledResults = allStocksData
    .filter((r) => r.status === "fulfilled")
    .map((r) => r.value);

  console.log(
    "Total number of stocks data retrieved: ",
    fulfilledResults.length
  );
  const formattedTime = moment
    .duration(endTime - startTime)
    .format("m [min] s [s] SSS [ms]");
  console.log(`Total execution time: ${formattedTime}`);
  try {
    await fs.writeFile(
      "data/allStocks.json",
      JSON.stringify(fulfilledResults, null, 2)
    );
    console.log("Dados salvos em data/allStocks.json com sucesso.");
  } catch (error) {
    console.error("Erro ao salvar os dados em JSON:", error);
  }
})();
