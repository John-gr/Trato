#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    Address, Env, String,
};

const AMOUNT: i128 = 500_0000000; // 500 USDC (7 decimales)
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
        &String::from_str(&s.env, "Logo para cafeteria"),
        &(s.env.ledger().timestamp() + 7 * DAY),
        &(3 * DAY),
    )
}

fn advance(env: &Env, secs: u64) {
    let t = env.ledger().timestamp();
    env.ledger().set_timestamp(t + secs);
}

#[test]
fn happy_path_client_releases() {
    let s = setup();
    let id = create(&s);
    assert_eq!(id, 0);
    assert_eq!(s.trato.count(), 1);

    s.trato.fund(&id, &s.client);
    assert_eq!(s.token.balance(&s.trato.address), AMOUNT);
    assert_eq!(s.trato.get(&id).status, Status::Funded);

    s.trato
        .deliver(&id, &String::from_str(&s.env, "https://figma.com/x"));
    assert_eq!(s.trato.get(&id).status, Status::Delivered);

    s.trato.release(&id);
    assert_eq!(s.token.balance(&s.freelancer), AMOUNT);
    assert_eq!(s.token.balance(&s.trato.address), 0);
    assert_eq!(s.trato.get(&id).status, Status::Released);
}

#[test]
fn freelancer_claims_after_review_period() {
    let s = setup();
    let id = create(&s);
    s.trato.fund(&id, &s.client);
    s.trato.deliver(&id, &String::from_str(&s.env, "entregado"));

    assert_eq!(
        s.trato.try_claim(&id).err().unwrap().unwrap(),
        Error::TooEarly.into()
    );
    advance(&s.env, 3 * DAY);
    s.trato.claim(&id);
    assert_eq!(s.token.balance(&s.freelancer), AMOUNT);
    assert_eq!(s.trato.get(&id).status, Status::Released);
}

#[test]
fn client_refund_when_not_delivered() {
    let s = setup();
    let id = create(&s);
    s.trato.fund(&id, &s.client);

    assert_eq!(
        s.trato.try_refund(&id).err().unwrap().unwrap(),
        Error::TooEarly.into()
    );
    advance(&s.env, 7 * DAY + 1);
    // Ya no se puede entregar
    assert_eq!(
        s.trato
            .try_deliver(&id, &String::from_str(&s.env, "tarde"))
            .err()
            .unwrap()
            .unwrap(),
        Error::DeadlinePassed.into()
    );
    s.trato.refund(&id);
    assert_eq!(s.token.balance(&s.client), AMOUNT * 2);
    assert_eq!(s.trato.get(&id).status, Status::Refunded);
}

#[test]
fn cancel_only_when_open() {
    let s = setup();
    let id = create(&s);
    s.trato.cancel(&id);
    assert_eq!(s.trato.get(&id).status, Status::Cancelled);
    assert_eq!(
        s.trato.try_fund(&id, &s.client).err().unwrap().unwrap(),
        Error::WrongStatus.into()
    );

    let id2 = create(&s);
    s.trato.fund(&id2, &s.client);
    assert_eq!(
        s.trato.try_cancel(&id2).err().unwrap().unwrap(),
        Error::WrongStatus.into()
    );
}

#[test]
fn rejects_invalid_input() {
    let s = setup();
    let now = s.env.ledger().timestamp();
    let title = String::from_str(&s.env, "x");
    assert_eq!(
        s.trato
            .try_create(&s.freelancer, &s.token.address, &0, &title, &(now + DAY), &DAY)
            .err()
            .unwrap()
            .unwrap(),
        Error::InvalidAmount.into()
    );
    assert_eq!(
        s.trato
            .try_create(&s.freelancer, &s.token.address, &AMOUNT, &title, &now, &DAY)
            .err()
            .unwrap()
            .unwrap(),
        Error::InvalidDeadline.into()
    );
    assert_eq!(
        s.trato
            .try_create(&s.freelancer, &s.token.address, &AMOUNT, &title, &(now + DAY), &1)
            .err()
            .unwrap()
            .unwrap(),
        Error::InvalidReviewPeriod.into()
    );
}

#[test]
fn freelancer_cannot_fund_own_deal() {
    let s = setup();
    let id = create(&s);
    assert_eq!(
        s.trato.try_fund(&id, &s.freelancer).err().unwrap().unwrap(),
        Error::SelfDeal.into()
    );
}

#[test]
fn release_requires_delivery() {
    let s = setup();
    let id = create(&s);
    s.trato.fund(&id, &s.client);
    assert_eq!(
        s.trato.try_release(&id).err().unwrap().unwrap(),
        Error::WrongStatus.into()
    );
}

#[test]
fn unknown_deal() {
    let s = setup();
    assert_eq!(
        s.trato.try_get(&42).err().unwrap().unwrap(),
        Error::NotFound.into()
    );
}
