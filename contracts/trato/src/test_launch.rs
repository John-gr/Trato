#![cfg(test)]
//! Tests de las funciones del lanzamiento: reputación, splits y disputas.
extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    vec, Address, Env, String,
};

const AMOUNT: i128 = 1_000_0000000; // 1000 unidades (7 decimales)
const DAY: u64 = 86_400;

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
    env.ledger().set_timestamp(1_000_000);

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
        &String::from_str(&s.env, "Landing para estudio de yoga"),
        &(s.env.ledger().timestamp() + 7 * DAY),
        &(3 * DAY),
    )
}

fn deliver(s: &Setup, id: u64) {
    s.trato
        .deliver(&id, &String::from_str(&s.env, "https://figma.com/entrega"));
}

fn advance(env: &Env, secs: u64) {
    let t = env.ledger().timestamp();
    env.ledger().set_timestamp(t + secs);
}

// ---------- Reputación ----------

#[test]
fn reputation_starts_empty() {
    let s = setup();
    let rep = s.trato.reputation(&s.freelancer);
    assert_eq!(rep.completed, 0);
    assert_eq!(rep.refunded, 0);
    assert_eq!(rep.disputed, 0);
    assert_eq!(rep.volume, 0);
}

#[test]
fn reputation_counts_release_and_refund() {
    let s = setup();

    let a = create(&s);
    s.trato.fund(&a, &s.client);
    deliver(&s, a);
    s.trato.release(&a);

    let b = create(&s);
    s.trato.fund(&b, &s.client);
    advance(&s.env, 8 * DAY);
    s.trato.refund(&b);

    let rep = s.trato.reputation(&s.freelancer);
    assert_eq!(rep.completed, 1);
    assert_eq!(rep.refunded, 1);
    assert_eq!(rep.volume, AMOUNT);
}

// ---------- Splits ----------

#[test]
fn splits_pay_each_member() {
    let s = setup();
    let designer = Address::generate(&s.env);
    let dev = Address::generate(&s.env);
    let id = create(&s);
    s.trato.set_splits(
        &id,
        &vec![
            &s.env,
            Split { recipient: s.freelancer.clone(), bps: 5_000 },
            Split { recipient: designer.clone(), bps: 3_000 },
            Split { recipient: dev.clone(), bps: 2_000 },
        ],
    );
    assert_eq!(s.trato.splits(&id).len(), 3);

    s.trato.fund(&id, &s.client);
    deliver(&s, id);
    s.trato.release(&id);

    assert_eq!(s.token.balance(&s.freelancer), AMOUNT / 2);
    assert_eq!(s.token.balance(&designer), AMOUNT * 3 / 10);
    assert_eq!(s.token.balance(&dev), AMOUNT / 5);
    assert_eq!(s.token.balance(&s.trato.address), 0);
}

#[test]
fn splits_must_sum_100_percent() {
    let s = setup();
    let id = create(&s);
    let other = Address::generate(&s.env);
    let res = s.trato.try_set_splits(
        &id,
        &vec![
            &s.env,
            Split { recipient: s.freelancer.clone(), bps: 6_000 },
            Split { recipient: other, bps: 3_000 },
        ],
    );
    assert_eq!(res, Err(Ok(Error::InvalidSplits.into())));
}

#[test]
fn splits_locked_after_funding() {
    let s = setup();
    let id = create(&s);
    s.trato.fund(&id, &s.client);
    let res = s.trato.try_set_splits(
        &id,
        &vec![&s.env, Split { recipient: s.freelancer.clone(), bps: 10_000 }],
    );
    assert_eq!(res, Err(Ok(Error::WrongStatus.into())));
}

#[test]
fn splits_reject_member_over_100_percent_even_if_sum_wraps() {
    let s = setup();
    let id = create(&s);
    let other = Address::generate(&s.env);
    // u32::MAX + 10_001 da la vuelta a exactamente 10_000 si no se valida cada integrante.
    let res = s.trato.try_set_splits(
        &id,
        &vec![
            &s.env,
            Split { recipient: s.freelancer.clone(), bps: u32::MAX },
            Split { recipient: other, bps: 10_001 },
        ],
    );
    assert_eq!(res, Err(Ok(Error::InvalidSplits.into())));
}

// ---------- Disputas ----------

#[test]
fn arbiter_splits_disputed_funds() {
    let s = setup();
    let arbiter = Address::generate(&s.env);
    let id = create(&s);
    s.trato.set_arbiter(&id, &arbiter);
    assert_eq!(s.trato.arbiter(&id), Some(arbiter));

    s.trato.fund(&id, &s.client);
    deliver(&s, id);
    s.trato.dispute(&id);
    assert_eq!(s.trato.get(&id).status, Status::Disputed);

    s.trato.resolve(&id, &7_000);
    assert_eq!(s.trato.get(&id).status, Status::Resolved);
    assert_eq!(s.token.balance(&s.freelancer), AMOUNT * 7 / 10);
    assert_eq!(s.token.balance(&s.client), AMOUNT * 2 - AMOUNT * 7 / 10);

    let rep = s.trato.reputation(&s.freelancer);
    assert_eq!(rep.disputed, 1);
    assert_eq!(rep.completed, 1);
}

#[test]
fn arbiter_cannot_fund_as_client() {
    let s = setup();
    let arbiter = Address::generate(&s.env);
    StellarAssetClient::new(&s.env, &s.token.address).mint(&arbiter, &AMOUNT);
    let id = create(&s);
    s.trato.set_arbiter(&id, &arbiter);
    assert_eq!(
        s.trato.try_fund(&id, &arbiter),
        Err(Ok(Error::ArbiterIsClient.into()))
    );
    assert_eq!(s.token.balance(&arbiter), AMOUNT);
}

#[test]
fn dispute_requires_arbiter() {
    let s = setup();
    let id = create(&s);
    s.trato.fund(&id, &s.client);
    deliver(&s, id);
    assert_eq!(s.trato.try_dispute(&id), Err(Ok(Error::NoArbiter.into())));
}

#[test]
fn dispute_closed_after_review_period() {
    let s = setup();
    let id = create(&s);
    s.trato.set_arbiter(&id, &Address::generate(&s.env));
    s.trato.fund(&id, &s.client);
    deliver(&s, id);
    advance(&s.env, 3 * DAY);
    assert_eq!(
        s.trato.try_dispute(&id),
        Err(Ok(Error::ReviewClosed.into()))
    );
    // El freelancer ya puede cobrar por timeout.
    s.trato.claim(&id);
}

#[test]
fn resolve_rejects_share_over_100_percent() {
    let s = setup();
    let id = create(&s);
    s.trato.set_arbiter(&id, &Address::generate(&s.env));
    s.trato.fund(&id, &s.client);
    deliver(&s, id);
    s.trato.dispute(&id);
    assert_eq!(
        s.trato.try_resolve(&id, &10_001),
        Err(Ok(Error::InvalidShare.into()))
    );
}
