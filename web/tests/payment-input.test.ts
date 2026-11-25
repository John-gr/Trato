import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MEMO_MAX_BYTES, memoBytes, parsePaymentInput } from "../src/lib/payment-input.ts";

const YO = "GAK34LSJUTMHV2CMGFRZU53W5SZTLYLANDECJMR4HJL3S5VC2ZNSM5GX";
const DESTINO = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

const form = (patch: Partial<{ destination: string; amount: string; memo: string }> = {}) => ({
  destination: DESTINO,
  amount: "1.5",
  memo: "",
  ...patch,
});

const errorOf = (result: ReturnType<typeof parsePaymentInput>) => (result.ok ? "" : result.error);

describe("parsePaymentInput", () => {
  it("acepta un pago válido y recorta espacios en los tres campos", () => {
    const result = parsePaymentInput({ destination: ` ${DESTINO} `, amount: " 2 ", memo: " RETO-01 " }, YO);
    assert.deepEqual(result, { ok: true, value: { destination: DESTINO, amount: "2", memo: "RETO-01" } });
  });

  it("rechaza destinos que no son una G válida y pagarse a uno mismo", () => {
    assert.match(errorOf(parsePaymentInput(form({ destination: "GNOVALIDA" }), YO)), /dirección G… válida/);
    assert.match(errorOf(parsePaymentInput(form({ destination: YO }), YO)), /tu propia cuenta/);
  });

  it("acepta montos con punto decimal y hasta 7 decimales", () => {
    for (const amount of ["1", "1.5", "0.0000001", "1000000"]) {
      assert.equal(parsePaymentInput(form({ amount }), YO).ok, true, amount);
    }
  });

  it("rechaza comas, más de 7 decimales, negativos y texto", () => {
    for (const amount of ["1,5", "0.00000001", "-1", "abc", ""]) {
      assert.match(errorOf(parsePaymentInput(form({ amount }), YO)), /Monto inválido/, amount);
    }
  });

  it("rechaza montos en cero aunque tengan decimales", () => {
    for (const amount of ["0", "0.0000000"]) {
      assert.match(errorOf(parsePaymentInput(form({ amount }), YO)), /mayor a 0/, amount);
    }
  });

  it("permite el memo vacío y hasta 28 bytes exactos", () => {
    assert.equal(parsePaymentInput(form({ memo: "" }), YO).ok, true);
    assert.equal(parsePaymentInput(form({ memo: "x".repeat(MEMO_MAX_BYTES) }), YO).ok, true);
    assert.equal(parsePaymentInput(form({ memo: "x".repeat(MEMO_MAX_BYTES + 1) }), YO).ok, false);
  });

  it("cuenta los acentos como 2 bytes, igual que Memo.text en la red", () => {
    assert.equal(memoBytes("é"), 2);
    assert.equal(parsePaymentInput(form({ memo: "é".repeat(14) }), YO).ok, true);
    assert.match(errorOf(parsePaymentInput(form({ memo: "é".repeat(15) }), YO)), /28 bytes/);
  });
});
