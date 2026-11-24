//! Reputación on-chain del freelancer.
//!
//! Cada trato terminado actualiza un registro público por dirección. El cliente lo ve
//! en el link de pago antes de depositar, sin depender de reseñas de una plataforma.

use soroban_sdk::{contracttype, Address, Env};

use crate::{DataKey, TTL_EXTEND_TO, TTL_THRESHOLD};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Reputation {
    /// Tratos pagados al freelancer (aprobados por el cliente o cobrados por timeout).
    pub completed: u32,
    /// Tratos reembolsados al cliente por no entregar a tiempo.
    pub refunded: u32,
    /// Tratos en los que el cliente abrió una disputa.
    pub disputed: u32,
    /// Monto total cobrado (en unidades del token, sin distinguir token).
    pub volume: i128,
}

fn empty() -> Reputation {
    Reputation {
        completed: 0,
        refunded: 0,
        disputed: 0,
        volume: 0,
    }
}

pub(crate) fn get(env: &Env, who: &Address) -> Reputation {
    let key = DataKey::Rep(who.clone());
    let rep: Option<Reputation> = env.storage().persistent().get(&key);
    if rep.is_some() {
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
    }
    rep.unwrap_or_else(empty)
}

fn put(env: &Env, who: &Address, rep: &Reputation) {
    let key = DataKey::Rep(who.clone());
    env.storage().persistent().set(&key, rep);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
}

pub(crate) fn record_completed(env: &Env, who: &Address, amount: i128) {
    let mut rep = get(env, who);
    rep.completed += 1;
    rep.volume += amount;
    put(env, who, &rep);
}

pub(crate) fn record_refunded(env: &Env, who: &Address) {
    let mut rep = get(env, who);
    rep.refunded += 1;
    put(env, who, &rep);
}

pub(crate) fn record_disputed(env: &Env, who: &Address) {
    let mut rep = get(env, who);
    rep.disputed += 1;
    put(env, who, &rep);
}
