import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Keypair } from "@stellar/stellar-sdk";
import {
  BPS_TOTAL,
  formatBps,
  MAX_SPLITS,
  parseArbiter,
  parseSplits,
  percentToBps,
  resolutionShares,
} from "../src/lib/team-input.ts";

const ANA = "GAK34LSJUTMHV2CMGFRZU53W5SZTLYLANDECJMR4HJL3S5VC2ZNSM5GX";
const BETO = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

describe("percentToBps", () => {
  it("convierte porcentajes con hasta 2 decimales sin errores de flotante", () => {
    // 0.29 * 100 da 28.999999999999996 con flotantes: por eso se convierte con enteros.
    const cases: Array<[string, number]> = [
      ["12.5", 1250],
      ["33.33", 3333],
      ["0.01", 1],
      ["0.29", 29],
      ["100", 10_000],
    ];
    for (const [input, bps] of cases) assert.equal(percentToBps(input), bps, input);
  });

  it("acepta coma decimal y espacios alrededor", () => {
    assert.equal(percentToBps(" 33,33 "), 3333);
  });

  it("rechaza más de 2 decimales, signos, notación científica y texto", () => {
    for (const input of ["0.001", "-5", "+5", "1e2", "abc", "", "1000"]) {
      assert.equal(percentToBps(input), null, input);
    }
  });
});

describe("formatBps", () => {
  it("muestra el porcentaje sin ceros de sobra", () => {
    assert.deepEqual([1250, 1, 6000, 3333, 10].map(formatBps), ["12.5", "0.01", "60", "33.33", "0.1"]);
  });

  it("es el inverso exacto de percentToBps", () => {
    for (const bps of [1, 29, 1250, 3333, 9999, BPS_TOTAL]) {
      assert.equal(percentToBps(formatBps(bps)), bps, String(bps));
    }
  });
});

describe("parseSplits", () => {
  it("acepta un reparto que suma exactamente 100 % y lo devuelve en bps", () => {
    const result = parseSplits([
      { recipient: ` ${ANA} `, percent: "60" },
      { recipient: BETO, percent: "40" },
    ]);
    assert.deepEqual(result, {
      ok: true,
      value: [
        { recipient: ANA, bps: 6000 },
        { recipient: BETO, bps: 4000 },
      ],
    });
  });

  it("rechaza un reparto que no suma 100 % y dice cuánto suma", () => {
    const result = parseSplits([
      { recipient: ANA, percent: "50" },
      { recipient: BETO, percent: "40" },
    ]);
    assert.equal(result.ok, false);
    assert.match(!result.ok ? result.error : "", /suma 90 %/);
  });

  it("rechaza integrantes en 0 % aunque el total sea 100 %", () => {
    const result = parseSplits([
      { recipient: ANA, percent: "100" },
      { recipient: BETO, percent: "0" },
    ]);
    assert.match(!result.ok ? result.error : "", /Integrante 2/);
  });

  it("rechaza direcciones repetidas o inválidas", () => {
    const repeated = parseSplits([
      { recipient: ANA, percent: "50" },
      { recipient: ANA, percent: "50" },
    ]);
    const invalid = parseSplits([{ recipient: "GNOVALIDA", percent: "100" }]);
    assert.match(!repeated.ok ? repeated.error : "", /ya está en el reparto/);
    assert.match(!invalid.ok ? invalid.error : "", /G… válida/);
  });

  it("rechaza listas vacías y de más de 10 integrantes, como el contrato", () => {
    const tooMany = Array.from({ length: MAX_SPLITS + 1 }, () => ({
      recipient: Keypair.random().publicKey(),
      percent: "1",
    }));
    assert.equal(parseSplits([]).ok, false);
    assert.equal(parseSplits(tooMany).ok, false);
  });
});

describe("parseArbiter", () => {
  it("no deja que el freelancer sea árbitro de su propio trato", () => {
    assert.deepEqual(parseArbiter(ANA, ANA), { ok: false, error: "No puedes ser el árbitro de tu propio trato." });
  });

  it("rechaza direcciones inválidas y acepta una G válida sin espacios", () => {
    assert.equal(parseArbiter("GNOVALIDA", ANA).ok, false);
    assert.deepEqual(parseArbiter(`  ${BETO}\n`, ANA), { ok: true, value: BETO });
  });
});

describe("resolutionShares", () => {
  it("redondea la parte del freelancer hacia abajo, igual que resolve en el contrato", () => {
    assert.deepEqual(resolutionShares(7n, 5000), { toFreelancer: 3n, toClient: 4n });
    assert.deepEqual(resolutionShares(1_000_000_000n, 7000), { toFreelancer: 700_000_000n, toClient: 300_000_000n });
  });

  it("0 % reembolsa todo y 100 % libera todo", () => {
    assert.deepEqual(resolutionShares(250n, 0), { toFreelancer: 0n, toClient: 250n });
    assert.deepEqual(resolutionShares(250n, BPS_TOTAL), { toFreelancer: 250n, toClient: 0n });
  });

  it("nunca pierde ni crea unidades: las dos partes suman el monto", () => {
    for (const bps of [1, 3333, 5000, 6667, 9999]) {
      const { toFreelancer, toClient } = resolutionShares(123_456_789n, bps);
      assert.equal(toFreelancer + toClient, 123_456_789n, String(bps));
    }
  });
});
