//! Splits para equipos.
//!
//! Un colectivo o agencia pequeña configura, mientras el trato sigue `Open`, cómo se reparte
//! el pago entre sus integrantes en puntos base (bps, 10_000 = 100 %). Al liberar, el contrato
//! paga a cada integrante directamente: nadie tiene que repartir a mano después.

use soroban_sdk::{contractevent, contractimpl, contracttype, panic_with_error, token, Address, Env, Vec};

use crate::{load, require_status, DataKey, Deal, Error, Status, Trato, TTL_EXTEND_TO, TTL_THRESHOLD};

pub const BPS_TOTAL: u32 = 10_000;
pub const MAX_SPLITS: u32 = 10;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Split {
    pub recipient: Address,
    pub bps: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SplitsSet {
    #[topic]
    pub id: u64,
    pub recipients: u32,
}

fn validate(env: &Env, splits: &Vec<Split>) {
    if splits.is_empty() || splits.len() > MAX_SPLITS {
        panic_with_error!(env, Error::InvalidSplits);
    }
    let mut total: u32 = 0;
    for s in splits.iter() {
        if s.bps == 0 {
            panic_with_error!(env, Error::InvalidSplits);
        }
        total += s.bps;
    }
    if total != BPS_TOTAL {
        panic_with_error!(env, Error::InvalidSplits);
    }
}

pub(crate) fn get(env: &Env, id: u64) -> Option<Vec<Split>> {
    let key = DataKey::Splits(id);
    let splits: Option<Vec<Split>> = env.storage().persistent().get(&key);
    if splits.is_some() {
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
    }
    splits
}

/// Paga `amount` del lado del freelancer: completo al freelancer si no hay splits,
/// o repartido según los bps. El último integrante recibe el residuo del redondeo.
pub(crate) fn pay_out(env: &Env, deal: &Deal, amount: i128) {
    if amount <= 0 {
        return;
    }
    let token = token::TokenClient::new(env, &deal.token);
    let from = env.current_contract_address();
    match get(env, deal.id) {
        None => token.transfer(&from, &deal.freelancer, &amount),
        Some(splits) => {
            let last = splits.len() - 1;
            let mut paid: i128 = 0;
            for (i, s) in splits.iter().enumerate() {
                let share = if i as u32 == last {
                    amount - paid
                } else {
                    amount * s.bps as i128 / BPS_TOTAL as i128
                };
                if share > 0 {
                    token.transfer(&from, &s.recipient, &share);
                }
                paid += share;
            }
        }
    }
}

#[contractimpl]
impl Trato {
    /// El freelancer define cómo se reparte el pago entre su equipo. Solo antes de que
    /// el cliente deposite, para que el cliente vea el reparto antes de pagar.
    pub fn set_splits(env: Env, id: u64, splits: Vec<Split>) {
        let deal = load(&env, id);
        deal.freelancer.require_auth();
        require_status(&env, &deal, Status::Open);
        validate(&env, &splits);

        let key = DataKey::Splits(id);
        env.storage().persistent().set(&key, &splits);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        SplitsSet {
            id,
            recipients: splits.len(),
        }
        .publish(&env);
    }

    /// Reparto configurado para un trato (vacío si todo va al freelancer).
    pub fn splits(env: Env, id: u64) -> Vec<Split> {
        load(&env, id);
        get(&env, id).unwrap_or_else(|| Vec::new(&env))
    }
}
