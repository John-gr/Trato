//! Disputas con árbitro.
//!
//! El freelancer propone un árbitro mientras el trato está `Open`; el cliente lo acepta
//! al depositar (el árbitro se muestra en el link antes de pagar). Si el cliente no está
//! conforme con la entrega, abre una disputa dentro del periodo de revisión y el árbitro
//! decide qué porcentaje recibe el freelancer: 100 % libera, 0 % reembolsa, lo demás reparte.

use soroban_sdk::{contractevent, contractimpl, panic_with_error, token, Address, Env};

use crate::{
    client_of, load, reputation, require_status, save, splits, DataKey, Error, Status, Trato,
    TTL_EXTEND_TO, TTL_THRESHOLD,
};

use crate::splits::BPS_TOTAL;

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ArbiterSet {
    #[topic]
    pub id: u64,
    pub arbiter: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DealDisputed {
    #[topic]
    pub id: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DealResolved {
    #[topic]
    pub id: u64,
    pub freelancer_bps: u32,
}

fn arbiter_of(env: &Env, id: u64) -> Option<Address> {
    let key = DataKey::Arbiter(id);
    let arbiter: Option<Address> = env.storage().persistent().get(&key);
    if arbiter.is_some() {
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
    }
    arbiter
}

#[contractimpl]
impl Trato {
    /// El freelancer propone un árbitro. Solo mientras nadie ha depositado.
    pub fn set_arbiter(env: Env, id: u64, arbiter: Address) {
        let deal = load(&env, id);
        deal.freelancer.require_auth();
        require_status(&env, &deal, Status::Open);
        if arbiter == deal.freelancer {
            panic_with_error!(&env, Error::SelfDeal);
        }

        let key = DataKey::Arbiter(id);
        env.storage().persistent().set(&key, &arbiter);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        ArbiterSet { id, arbiter }.publish(&env);
    }

    /// El cliente rechaza la entrega y pasa la decisión al árbitro.
    /// Solo dentro del periodo de revisión: después, el freelancer ya puede cobrar.
    pub fn dispute(env: Env, id: u64) {
        let mut deal = load(&env, id);
        let client = client_of(&env, &deal);
        client.require_auth();
        require_status(&env, &deal, Status::Delivered);
        if arbiter_of(&env, id).is_none() {
            panic_with_error!(&env, Error::NoArbiter);
        }
        if env.ledger().timestamp() >= deal.delivered_at + deal.review_period {
            panic_with_error!(&env, Error::ReviewClosed);
        }

        deal.status = Status::Disputed;
        save(&env, &deal);
        reputation::record_disputed(&env, &deal.freelancer);
        DealDisputed { id }.publish(&env);
    }

    /// El árbitro resuelve: `freelancer_bps` del monto va al freelancer (o a su equipo)
    /// y el resto regresa al cliente.
    pub fn resolve(env: Env, id: u64, freelancer_bps: u32) {
        let mut deal = load(&env, id);
        let arbiter = arbiter_of(&env, id).unwrap_or_else(|| panic_with_error!(&env, Error::NoArbiter));
        arbiter.require_auth();
        require_status(&env, &deal, Status::Disputed);
        if freelancer_bps > BPS_TOTAL {
            panic_with_error!(&env, Error::InvalidShare);
        }

        let client = client_of(&env, &deal);
        let to_freelancer = deal.amount * freelancer_bps as i128 / BPS_TOTAL as i128;
        let to_client = deal.amount - to_freelancer;

        splits::pay_out(&env, &deal, to_freelancer);
        if to_client > 0 {
            token::TokenClient::new(&env, &deal.token).transfer(
                &env.current_contract_address(),
                &client,
                &to_client,
            );
        }

        if to_freelancer > 0 {
            reputation::record_completed(&env, &deal.freelancer, to_freelancer);
        } else {
            reputation::record_refunded(&env, &deal.freelancer);
        }
        deal.status = Status::Resolved;
        save(&env, &deal);
        DealResolved { id, freelancer_bps }.publish(&env);
    }

    /// Árbitro del trato, si se definió uno.
    pub fn arbiter(env: Env, id: u64) -> Option<Address> {
        load(&env, id);
        arbiter_of(&env, id)
    }
}
