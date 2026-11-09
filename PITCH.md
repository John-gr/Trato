# Trato — guion de pitch (5 min)

## 0:00 – 0:45 · El problema (con una persona real)
> "Ana es diseñadora en Guadalajara. Le hace un logo a una cafetería en Texas por 300 dólares.
> Entrega… y el cliente deja de contestar. Le pasa a muchos freelancers: si cobran después, se arriesgan a no cobrar;
> si cobran antes, el cliente no confía. Upwork o Fiverr lo resuelven, pero se quedan con el 10–20 % y tardan días en pagar."

**Tip:** si alguien del equipo o un conocido vivió esto, cuéntenlo con nombre. Eso pesa en "Problema y usuario".

## 0:45 – 1:30 · La solución
> "Trato es un link de pago con escrow. Ana crea el trato y le manda el link al cliente. El cliente deposita en USDC y el dinero
> queda bloqueado en un contrato inteligente, no con nosotros. Hay solo tres finales posibles:
> el cliente aprueba y Ana cobra; el cliente no responde a tiempo y Ana cobra igual; o Ana no entrega y el cliente recupera su dinero."

## 1:30 – 3:30 · Demo en vivo (testnet)
1. Wallet A (freelancer): crear trato con revisión de "2 minutos (demo)" y copiar el link.
2. Wallet B (cliente, otro navegador): abrir el link, depositar y firmar → **abrir la tx en stellar.expert**.
3. Wallet A: marcar como entregado (link al entregable).
4. Wallet B: aprobar y pagar → **mostrar en stellar.expert la transferencia del contrato al freelancer**.
5. (Si hay tiempo) Mostrar el trato #1 en stellar.expert: `DealReleased by_timeout: true`, el cobro automático por silencio del cliente.

**Antes de la demo:** tener las dos wallets con fondos de testnet y el trato a medio camino por si falla el wifi.

## 3:30 – 4:30 · ¿Por qué Stellar?
- **Soroban** custodia los fondos con reglas de tiempo; nadie puede tocar el dinero fuera de esas reglas.
- **USDC nativo** en Stellar: dinero estable, no especulativo, lo que necesita un freelancer.
- **Fees de fracción de centavo** y ~5 s de confirmación: tiene sentido incluso para pagos de 20 USD.
- **Stellar Wallets Kit**: funciona con Freighter, xBull, Lobstr, Albedo, etc.
- **Anchors (SEP-24)**: el siguiente paso es cobrar en USDC y retirar en pesos.

## 4:30 – 5:00 · Qué sigue
Disputas con árbitro, pagos por hitos y retiro a moneda local vía anchors.

> "Trato: cierra el trato, cobra seguro."

---

## Preguntas probables de los jueces
- **¿Y si el cliente dice que el trabajo está mal?** Hoy el cliente tiene el periodo de revisión para no aprobar y negociar.
  En el roadmap: disputas con un árbitro elegido por ambas partes.
- **¿Qué pasa si el freelancer marca "entregado" sin entregar nada?** La evidencia queda on-chain y el cliente puede revisarla.
  El periodo de revisión lo elige el freelancer al crear el trato y el cliente lo ve antes de depositar.
- **¿Por qué no un backend?** No hace falta: el contrato es la fuente de verdad y el front lee directo de Stellar.
  Menos infraestructura significa menos confianza requerida.
- **¿Comisión?** Cero en el MVP. Modelo futuro: un fee pequeño (<1 %) dentro del contrato.
