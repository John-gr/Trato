#![cfg(test)]
//! Límites exactos de tiempo. Cada regla se prueba en el segundo justo antes y justo en el borde,
//! porque la UI copia estas mismas comparaciones (`<`, `<=`, `>`, `>=`) para mostrar las acciones.
extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    Address, Env, String,
};

const AMOUNT: i128 = 100_0000000; // 100 USDC (7 decimales)
const DAY: u64 = 86_400;
const START: u64 = 1_000_000;
const DEADLINE: u64 = START + 7 * DAY;
const REVIEW: u64 = 3 * DAY;

struct Setup<'a> {
    env: Env,
    trato: TratoClient<'a>,
    token: TokenClient<'a>,
    freelancer: Address,
    client: Address,
}

fn setup<'a>() -> Setup<'a> {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(START);

    let admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(admin);
    let token = TokenClient::new(&env, &sac.address());
    let freelancer = Address::generate(&env);
    let client = Address::generate(&env);
    StellarAssetClient::new(&env, &sac.address()).mint(&client, &(AMOUNT * 2));

    let id = env.register(Trato, ());
    let trato = TratoClient::new(&env, &id);
    Setup {
        env,
        trato,
        token,
        freelancer,
        client,
    }
}

fn create(s: &Setup) -> u64 {
    s.trato.create(
        &s.freelancer,
        &s.token.address,
        &AMOUNT,
        &String::from_str(&s.env, "Landing page"),
        &DEADLINE,
        &REVIEW,
    )
}

fn at(env: &Env, timestamp: u64) {
    env.ledger().set_timestamp(timestamp);
}

fn proof(s: &Setup) -> String {
    String::from_str(&s.env, "https://drive.example/entrega")
}

// fund: now < delivery_deadline

#[test]
fn fund_works_one_second_before_deadline() {
    let s = setup();
    let id = create(&s);
    at(&s.env, DEADLINE - 1);
    s.trato.fund(&id, &s.client);
    assert_eq!(s.trato.get(&id).status, Status::Funded);
    assert_eq!(s.token.balance(&s.trato.address), AMOUNT);
}

#[test]
fn fund_fails_at_exact_deadline() {
    let s = setup();
    let id = create(&s);
    at(&s.env, DEADLINE);
    assert_eq!(
        s.trato.try_fund(&id, &s.client),
        Err(Ok(Error::DeadlinePassed.into()))
    );
    assert_eq!(s.token.balance(&s.client), AMOUNT * 2);
}

// deliver: now <= delivery_deadline

#[test]
fn deliver_works_at_exact_deadline() {
    let s = setup();
    let id = create(&s);
    s.trato.fund(&id, &s.client);
    at(&s.env, DEADLINE);
    s.trato.deliver(&id, &proof(&s));
    let deal = s.trato.get(&id);
    assert_eq!(deal.status, Status::Delivered);
    assert_eq!(deal.delivered_at, DEADLINE);
}

#[test]
fn deliver_fails_one_second_after_deadline() {
    let s = setup();
    let id = create(&s);
    s.trato.fund(&id, &s.client);
    at(&s.env, DEADLINE + 1);
    assert_eq!(
        s.trato.try_deliver(&id, &proof(&s)),
        Err(Ok(Error::DeadlinePassed.into()))
    );
    assert_eq!(s.trato.get(&id).status, Status::Funded);
}

// refund: now > delivery_deadline

#[test]
fn refund_fails_at_exact_deadline() {
    let s = setup();
    let id = create(&s);
    s.trato.fund(&id, &s.client);
    at(&s.env, DEADLINE);
    assert_eq!(s.trato.try_refund(&id), Err(Ok(Error::TooEarly.into())));
    assert_eq!(s.token.balance(&s.trato.address), AMOUNT);
}

#[test]
fn refund_works_one_second_after_deadline() {
    let s = setup();
    let id = create(&s);
    s.trato.fund(&id, &s.client);
    at(&s.env, DEADLINE + 1);
    s.trato.refund(&id);
    assert_eq!(s.trato.get(&id).status, Status::Refunded);
    assert_eq!(s.token.balance(&s.client), AMOUNT * 2);
}

/// Trato fondeado y entregado en `START`, así que la revisión cierra en `START + REVIEW`.
fn delivered(s: &Setup) -> u64 {
    let id = create(s);
    s.trato.fund(&id, &s.client);
    s.trato.deliver(&id, &proof(s));
    id
}

// claim: now >= delivered_at + review_period

#[test]
fn claim_fails_one_second_before_review_ends() {
    let s = setup();
    let id = delivered(&s);
    at(&s.env, START + REVIEW - 1);
    assert_eq!(s.trato.try_claim(&id), Err(Ok(Error::TooEarly.into())));
    assert_eq!(s.token.balance(&s.freelancer), 0);
}

#[test]
fn claim_works_at_exact_review_end() {
    let s = setup();
    let id = delivered(&s);
    at(&s.env, START + REVIEW);
    s.trato.claim(&id);
    assert_eq!(s.trato.get(&id).status, Status::Released);
    assert_eq!(s.token.balance(&s.freelancer), AMOUNT);
}

// dispute: now < delivered_at + review_period

fn delivered_with_arbiter(s: &Setup) -> u64 {
    let id = create(s);
    s.trato.set_arbiter(&id, &Address::generate(&s.env));
    s.trato.fund(&id, &s.client);
    s.trato.deliver(&id, &proof(s));
    id
}

#[test]
fn dispute_works_one_second_before_review_ends() {
    let s = setup();
    let id = delivered_with_arbiter(&s);
    at(&s.env, START + REVIEW - 1);
    s.trato.dispute(&id);
    assert_eq!(s.trato.get(&id).status, Status::Disputed);
}

#[test]
fn dispute_fails_at_exact_review_end() {
    let s = setup();
    let id = delivered_with_arbiter(&s);
    at(&s.env, START + REVIEW);
    assert_eq!(
        s.trato.try_dispute(&id),
        Err(Ok(Error::ReviewClosed.into()))
    );
    // En ese mismo segundo el freelancer ya puede cobrar: las dos reglas no se enciman.
    s.trato.claim(&id);
    assert_eq!(s.trato.get(&id).status, Status::Released);
}
