#![no_std]
//! Trato — escrow de pago para freelancers.
//!
//! Flujo:
//!   1. El freelancer crea un trato (monto, token, deadline de entrega, periodo de revisión).
//!   2. El cliente abre el link y fondea: los tokens quedan bloqueados en el contrato.
//!   3. El freelancer marca la entrega (con un link/evidencia).
//!   4. El cliente libera el pago, o si no responde dentro del periodo de revisión,
//!      el freelancer puede cobrar por sí mismo.
//!   Si el freelancer no entrega antes del deadline, el cliente recupera su dinero.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, token,
    Address, Env, String,
};

const DAY_IN_LEDGERS: u32 = 17_280;
const TTL_THRESHOLD: u32 = 30 * DAY_IN_LEDGERS;
const TTL_EXTEND_TO: u32 = 120 * DAY_IN_LEDGERS;

const MIN_REVIEW_SECS: u64 = 60;
const MAX_REVIEW_SECS: u64 = 60 * 60 * 24 * 30;
const MAX_TEXT_LEN: u32 = 280;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotFound = 1,
    InvalidAmount = 2,
    InvalidDeadline = 3,
    InvalidReviewPeriod = 4,
    TextTooLong = 5,
    WrongStatus = 6,
    NotClient = 7,
    SelfDeal = 8,
    DeadlinePassed = 9,
    TooEarly = 10,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Status {
    /// Creado por el freelancer, esperando fondos del cliente.
    Open,
    /// El cliente bloqueó los fondos.
    Funded,
    /// El freelancer marcó el trabajo como entregado.
    Delivered,
    /// Fondos pagados al freelancer.
    Released,
    /// Fondos devueltos al cliente (no hubo entrega a tiempo).
    Refunded,
    /// El freelancer canceló antes de recibir fondos.
    Cancelled,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Deal {
    pub id: u64,
    pub freelancer: Address,
    pub client: Option<Address>,
    pub token: Address,
    pub amount: i128,
    pub title: String,
    pub delivery_deadline: u64,
    pub review_period: u64,
    pub delivered_at: u64,
    pub evidence: String,
    pub status: Status,
    pub created_at: u64,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Count,
    Deal(u64),
}

// ---------- Eventos ----------

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DealCreated {
    #[topic]
    pub id: u64,
    pub freelancer: Address,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DealFunded {
    #[topic]
    pub id: u64,
    pub client: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DealDelivered {
    #[topic]
    pub id: u64,
    pub evidence: String,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DealReleased {
    #[topic]
    pub id: u64,
    pub by_timeout: bool,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DealRefunded {
    #[topic]
    pub id: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DealCancelled {
    #[topic]
    pub id: u64,
}

#[contract]
pub struct Trato;

fn load(env: &Env, id: u64) -> Deal {
    let key = DataKey::Deal(id);
    let deal: Deal = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| panic_with_error!(env, Error::NotFound));
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
    deal
}

fn save(env: &Env, deal: &Deal) {
    let key = DataKey::Deal(deal.id);
    env.storage().persistent().set(&key, deal);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
}

fn require_status(env: &Env, deal: &Deal, status: Status) {
    if deal.status != status {
        panic_with_error!(env, Error::WrongStatus);
    }
}

fn client_of(env: &Env, deal: &Deal) -> Address {
    deal.client
        .clone()
        .unwrap_or_else(|| panic_with_error!(env, Error::NotClient))
}

fn pay(env: &Env, deal: &Deal, to: &Address) {
    token::TokenClient::new(env, &deal.token).transfer(
        &env.current_contract_address(),
        to,
        &deal.amount,
    );
}

#[contractimpl]
impl Trato {
    /// El freelancer crea un trato. Devuelve el id que va en el link de pago.
    pub fn create(
        env: Env,
        freelancer: Address,
        token: Address,
        amount: i128,
        title: String,
        delivery_deadline: u64,
        review_period: u64,
    ) -> u64 {
        freelancer.require_auth();

        let now = env.ledger().timestamp();
        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        if delivery_deadline <= now {
            panic_with_error!(&env, Error::InvalidDeadline);
        }
        if !(MIN_REVIEW_SECS..=MAX_REVIEW_SECS).contains(&review_period) {
            panic_with_error!(&env, Error::InvalidReviewPeriod);
        }
        if title.len() > MAX_TEXT_LEN {
            panic_with_error!(&env, Error::TextTooLong);
        }

        let id: u64 = env.storage().instance().get(&DataKey::Count).unwrap_or(0);
        env.storage().instance().set(&DataKey::Count, &(id + 1));
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);

        let deal = Deal {
            id,
            freelancer: freelancer.clone(),
            client: None,
            token,
            amount,
            title,
            delivery_deadline,
            review_period,
            delivered_at: 0,
            evidence: String::from_str(&env, ""),
            status: Status::Open,
            created_at: now,
        };
        save(&env, &deal);

        DealCreated {
            id,
            freelancer,
            amount,
        }
        .publish(&env);
        id
    }

    /// El cliente bloquea los fondos en el contrato.
    pub fn fund(env: Env, id: u64, client: Address) {
        client.require_auth();
        let mut deal = load(&env, id);
        require_status(&env, &deal, Status::Open);
        if client == deal.freelancer {
            panic_with_error!(&env, Error::SelfDeal);
        }
        if env.ledger().timestamp() >= deal.delivery_deadline {
            panic_with_error!(&env, Error::DeadlinePassed);
        }

        token::TokenClient::new(&env, &deal.token).transfer(
            &client,
            &env.current_contract_address(),
            &deal.amount,
        );

        deal.client = Some(client.clone());
        deal.status = Status::Funded;
        save(&env, &deal);
        DealFunded { id, client }.publish(&env);
    }

    /// El freelancer marca el trabajo como entregado, con un link o nota de evidencia.
    pub fn deliver(env: Env, id: u64, evidence: String) {
        let mut deal = load(&env, id);
        deal.freelancer.require_auth();
        require_status(&env, &deal, Status::Funded);
        if evidence.len() > MAX_TEXT_LEN {
            panic_with_error!(&env, Error::TextTooLong);
        }
        let now = env.ledger().timestamp();
        if now > deal.delivery_deadline {
            panic_with_error!(&env, Error::DeadlinePassed);
        }

        deal.delivered_at = now;
        deal.evidence = evidence.clone();
        deal.status = Status::Delivered;
        save(&env, &deal);
        DealDelivered { id, evidence }.publish(&env);
    }

    /// El cliente aprueba la entrega y libera el pago.
    pub fn release(env: Env, id: u64) {
        let mut deal = load(&env, id);
        let client = client_of(&env, &deal);
        client.require_auth();
        require_status(&env, &deal, Status::Delivered);

        pay(&env, &deal, &deal.freelancer);
        deal.status = Status::Released;
        save(&env, &deal);
        DealReleased {
            id,
            by_timeout: false,
        }
        .publish(&env);
    }

    /// Si el cliente no responde dentro del periodo de revisión, el freelancer cobra.
    pub fn claim(env: Env, id: u64) {
        let mut deal = load(&env, id);
        deal.freelancer.require_auth();
        require_status(&env, &deal, Status::Delivered);
        if env.ledger().timestamp() < deal.delivered_at + deal.review_period {
            panic_with_error!(&env, Error::TooEarly);
        }

        pay(&env, &deal, &deal.freelancer);
        deal.status = Status::Released;
        save(&env, &deal);
        DealReleased {
            id,
            by_timeout: true,
        }
        .publish(&env);
    }

    /// Si el freelancer no entregó antes del deadline, el cliente recupera su dinero.
    pub fn refund(env: Env, id: u64) {
        let mut deal = load(&env, id);
        let client = client_of(&env, &deal);
        client.require_auth();
        require_status(&env, &deal, Status::Funded);
        if env.ledger().timestamp() <= deal.delivery_deadline {
            panic_with_error!(&env, Error::TooEarly);
        }

        pay(&env, &deal, &client);
        deal.status = Status::Refunded;
        save(&env, &deal);
        DealRefunded { id }.publish(&env);
    }

    /// El freelancer cancela un trato que nadie ha fondeado.
    pub fn cancel(env: Env, id: u64) {
        let mut deal = load(&env, id);
        deal.freelancer.require_auth();
        require_status(&env, &deal, Status::Open);
        deal.status = Status::Cancelled;
        save(&env, &deal);
        DealCancelled { id }.publish(&env);
    }

    pub fn get(env: Env, id: u64) -> Deal {
        load(&env, id)
    }

    pub fn count(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::Count).unwrap_or(0)
    }
}

#[cfg(test)]
mod test;
