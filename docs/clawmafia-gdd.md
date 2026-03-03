# ClawMafia — Master Game Design Document

**Version:** 1.0
**Task:** NAV-93 (synthesis of NAV-88/89/90/91/92)
**Author:** Navi
**Date:** 2026-03-03
**Status:** Draft — awaiting Ryan's review

---

## Table of Contents

1. [Vision & Design Pillars](#1-vision--design-pillars)
2. [Game Overview](#2-game-overview)
3. [The Extraction Loop — Core Gameplay](#3-the-extraction-loop--core-gameplay)
4. [Turn Action Catalog](#4-turn-action-catalog)
5. [Stat System](#5-stat-system)
6. [Combat Resolution Algorithm](#6-combat-resolution-algorithm)
7. [Recursive Prompt System (The Mafiosa)](#7-recursive-prompt-system-the-mafiosa)
8. [Heat / Wanted System](#8-heat--wanted-system)
9. [Family / Clan System](#9-family--clan-system)
10. [Territory System](#10-territory-system)
11. [Tokenomics & On-Chain Architecture](#11-tokenomics--on-chain-architecture)
12. [Economy Sustainability](#12-economy-sustainability)
13. [Extraction Shooter Learnings Applied](#13-extraction-shooter-learnings-applied)
14. [Browser Mafia Game Learnings Applied](#14-browser-mafia-game-learnings-applied)
15. [Implementation Phases](#15-implementation-phases)
16. [Open Design Questions](#16-open-design-questions)
17. [Architecture Summary](#17-architecture-summary)
18. [Source Documents](#18-source-documents)

---

## 1. Vision & Design Pillars

### The Pitch

ClawMafia is an **agent-driven extraction mafia game** where each player deploys an AI agent — their "mafiosa" — into a persistent criminal underworld. Every 3 hours, agents execute actions, clash with rivals, and transfer real $CLAW tokens on-chain when attacks land. The house collects fees on every transfer. Players write the personality prompt that shapes their agent's behavior; the AI handles the grind, the combat, and the drama.

Think: *Escape from Tarkov's risk-reward loop meets Torn City's 20-year browser mafia persistence, powered by AI agents with real crypto stakes.*

### Design Pillars

| Pillar | Principle | Source |
|--------|-----------|--------|
| **Extraction Risk** | Every offensive action risks real tokens. You can lose what you brought in. The fear of loss makes the wins meaningful — directly from extraction shooter design. | EFT, Hunt: Showdown |
| **Zero-Sum PvP** | Combat redistributes tokens, never mints them. One agent's loss is another's gain. Structurally anti-inflationary. | DrugWars postmortem |
| **Persistent Progress** | No seasonal resets on stats or balances. Your character compounds over months and years. This is what creates 10-year players. | Torn City, Bootleggers |
| **Social Obligation** | Families create bonds that transcend individual play. Your family needs you; leaving means abandoning relationships, not just a game. | Torn factions, OGame alliances |
| **AI as Player Agent** | The AI handles the grind; humans make the consequential calls. Prompt engineering is the skill expression. | Colony (Parallel), original design |
| **Minimum Viable On-Chain** | Game state lives off-chain. Only token balances, transfers, and fee collection go on-chain. Gas costs stay negligible. | Dark Forest learnings |
| **Low Attention Overhead** | 3-hour turn cadence. Submit your action, check back later. Designed for people with jobs, not people who play games as a job. | OGame/Travian tick model |

### What This Game Is NOT

- **Not pay-to-win.** Whales can deposit more CLAW, but stat caps, heat mechanics, and LLM modifiers mean money alone doesn't win.
- **Not play-to-earn.** There is no emission-as-reward loop. Tokens circulate between players; the game doesn't print money.
- **Not a slot machine.** Every action has strategic tradeoffs. Grow Drugs is safe but slow. Targeted Hit is lucrative but burns heat. Lay Low builds nothing but keeps you alive.
- **Not a real-time grinder.** 3-hour turns, simultaneous resolution. No advantage to being online 24/7.

---

## 2. Game Overview

### Core Loop

```
1. DEPOSIT — Player buys $CLAW on Bankr DEX, deposits into ClawMafiaVault
2. PROMPT — Player writes a mafiosa personality prompt (255 chars)
          + optional meta-prompt (500 chars) that adapts based on game state
3. ACT — Player chooses one of 27 actions per 3-hour turn
4. RESOLVE — All actions resolve simultaneously at the turn tick:
    - Meta-prompts generate final mafiosa prompts
    - Family collisions detected and upgraded to heists
    - Combat runs: stat calc → LLM modifier → VRF random → outcome
    - On-chain transfers execute atomically
5. EXTRACT — Successful attackers gain CLAW; losers lose CLAW; house takes 3%
6. ADAPT — Stats update, heat accumulates/decays, narrative published
7. REPEAT — Next turn opens. Adapt strategy. Submit new action.
```

### Key Numbers

| Parameter | Value |
|-----------|-------|
| Turn cadence | 3 hours (8 turns/day) |
| Actions per turn | 1 per player |
| Max family size | 10 members |
| Stat ceiling | 100 (hard cap, all combat stats) |
| House fee | 3% of every transfer |
| Minimum balance (respawn floor) | 50 CLAW (untouchable) |
| Max loot per attack | 1,000 CLAW (cap on Targeted Hit) |
| LLM combat modifier range | +/- 15% |
| Max success probability | 95% (never auto-win) |
| Min success probability | 5% (never auto-lose) |
| Territories | 6 named zones |
| Emission pool (recommended) | 2B CLAW (2% of 100B supply) |

---

## 3. The Extraction Loop — Core Gameplay

ClawMafia's core loop mirrors the extraction shooter genre's central tension: **bring value in, risk it for more, try to get out richer than you entered.** The difference: instead of gear fear, there's *token fear*.

### The Extraction Shooter Parallel

| Extraction Shooter Concept | ClawMafia Equivalent |
|---------------------------|---------------------|
| **Gear fear** (risking equipment you brought into a raid) | **Token fear** (your deposited CLAW is at risk every turn) |
| **Loot extraction** (finding and safely extracting items) | **Resource actions** (Grow Drugs, Run Numbers, Fence Goods — earning from the emission pool) |
| **PvP encounters** (killing other players for their loot) | **PvP actions** (Street Robbery, Targeted Hit, Carjacking — stealing CLAW from other players) |
| **Scav runs** (risk-free income opportunities) | **"Scraping By" mode** (3-turn protection after going broke) |
| **Insurance** (recovering gear after death) | **Respawn floor** (50 CLAW always protected) |
| **Extraction points** (timed, strategic withdrawal) | **Withdrawal cooldown** (1-turn delay; balance still at risk) |
| **Flea market** (player-to-player economy) | **On-chain DEX trading** ($CLAW on Bankr/Uniswap) |
| **Progression tree** (permanent unlocks) | **Stat system** (permanent growth with soft caps) |
| **Map knowledge** (knowing spawns, routes, extracts) | **Intel actions** (Scout, Survey, Bug Phone — information is power) |

### Risk Stratification

The game provides clear risk tiers, so players self-select:

| Risk Tier | Actions | Token Risk | Potential Gain | Heat Gain |
|-----------|---------|-----------|----------------|-----------|
| **Safe** | Lay Low, Fence Goods, Grow Drugs | 0-5 CLAW | 40-150 CLAW (pool) | 0 |
| **Moderate** | Run Numbers, Smuggle Alcohol, Scout | 0-10 CLAW | 30-200 CLAW (pool) | 0-2 |
| **Aggressive** | Street Robbery, Carjacking, Extortion | 0-20 CLAW | 3-10% of target's balance | 2-3 |
| **High Stakes** | Targeted Hit, Family Heist, Territory War | 20-30 CLAW | 10-25% of target's balance | 3-5 |
| **All-In** | Plant Evidence, Arson, Organized Crime | 20-50 CLAW | Variable / destructive | 4-5 |

This stratification ensures the game has a "Scav run" equivalent (safe resource grinding) alongside a "Labs raid" equivalent (high-stakes PvP with massive upside and downside).

---

## 4. Turn Action Catalog

Each turn, a player chooses exactly one action. Actions resolve simultaneously at the turn tick. Family-coordinated actions are declared individually but resolved together when the system detects matching intent.

### 4.1 Action Categories

All 27 actions fall into five categories:

| Category | Count | Core Loop |
|----------|-------|-----------|
| **Resource** (solo/economic) | 5 | Generate CLAW from emission pool. Safe-ish. Builds Wealth. |
| **Self-Improvement** (solo/defensive) | 6 | Build stats, reduce heat, fortify. No direct CLAW gain. |
| **Aggression** (PvP/offensive) | 6 | Take CLAW from other players. High heat. |
| **Intelligence** (PvP/intel) | 4 | Gather info or manipulate another player's state. |
| **Family** (coordinated) | 6 | Require family membership. Amplified rewards, shared risk. |

### 4.2 Master Action Table

| # | Name | Category | Target | Cost | Base % | Reward | Heat | Stats Built | CD | Family |
|---|------|----------|--------|------|--------|--------|------|-------------|----|----|
| 1 | **Lay Low** | Self-Imp | Self | 0 | 100% | 0 | -5 (decay) | Def +1 | - | No |
| 2 | **Grow Drugs** | Resource | Self | 0 | 85% | 50-150 (pool) | 0 | Wlth +1 | - | No |
| 3 | **Run Numbers** | Resource | Self | 0 | 80% | 30-100 (pool) | +1 | Wlth +1, Inf +1 | - | No |
| 4 | **Smuggle Alcohol** | Resource | Self | 10 | 75% | 80-200 (pool) | +1/+2 | Wlth +2 | 2 | No |
| 5 | **Fence Goods** | Resource | Self | 5 | 90% | 40-120 (pool) | 0 | Wlth +1 | - | No |
| 6 | **Run a Racket** | Resource | Self | 15 | 70% | 100-250 (pool) | +2 | Wlth +2, Inf +1 | 3 | No |
| 7 | **Street Robbery** | Aggression | Random | 0 | 40-60% | 5-10% target bal (cap 500) | +2 | Atk +2 | - | No |
| 8 | **Targeted Hit** | Aggression | Specific | 20 | 30-55% | 10-20% target bal (cap 1000) | +3/+5 | Atk +3 | 3 | Yes (+10%) |
| 9 | **Carjacking** | Aggression | Random | 0 | 50-65% | 3-8% target bal (cap 300) | +2 | Atk +1, Wlth +1 | - | No |
| 10 | **Protection Extortion** | Aggression | Specific | 0 | 35-55% | 2% of target earnings/3 turns | +2 | Inf +3, Atk +1 | 5 | Yes |
| 11 | **Arson** | Aggression | Specific | 25 | 45-60% | Destroys target's territory bonus for 3 turns | +3 | Atk +2 | 4 | No |
| 12 | **Set Ambush** | Aggression | Specific | 15 | Special* | Counter-attack if target acts aggressively | +1 | Atk +2, Def +2 | 3 | No |
| 13 | **Post Guards** | Self-Imp | Self | 10 | 100% | Reduces incoming attack by 20% | 0 | Def +3 | 3 | No |
| 14 | **Train** | Self-Imp | Self | 0 | 100% | +2 to chosen stat | 0 | (chosen) +2 | 2 | No |
| 15 | **Bribe Cops** | Self-Imp | Self | 30 | 80% | Heat -30 | 0 | Inf +2 | 4 | No |
| 16 | **Recruit Associate** | Self-Imp | Self | 15 | 70% | +1 Associate (Def bonus) | 0 | Inf +2, Def +1 | 5 | No |
| 17 | **Money Laundering** | Self-Imp | Self | 50 | 70% | Converts dirty to clean CLAW | +5 (fail) | Wlth +2, Inf +1 | 5 | No |
| 18 | **Scout Player** | Intel | Specific | 5 | 85% | Reveals Heat, Def, last action | 0 | Inf +1 | 2 | No |
| 19 | **Survey Territory** | Intel | Territory | 5 | 90% | Reveals territory value + occupant | 0 | Inf +1 | 3 | No |
| 20 | **Bug Phone** | Intel | Specific | 15 | 60% | Reveals target's mafiosa prompt 2 turns | 0 | Inf +3 | 5 | No |
| 21 | **Plant Evidence** | Intel | Specific | 20 | 55% | Target Heat +20 for 3 turns | +5 (backfire) | Inf +2 | 4 | No |
| 22 | **Pay Tribute** | Family | Boss | 5% bal | 100% | Respect +5, treasury grows | 0 | Resp +5 | 1/turn | Fam only |
| 23 | **Broker Alliance** | Family | Player/Fam | 0 | Negotiation | Non-aggression pact 3 turns | 0 | Inf +3 | 6 | Yes |
| 24 | **Family Heist** | Family | Specific | 30/member | 50-75% | 15-25% target bal (split) | +4 each | Atk +3 | 6 | Required (2+) |
| 25 | **Organized Crime** | Family | NPC target | 20/member | 60-80% | 200-500 CLAW (pool, split) | +2 each | Atk +2, Inf +1 | 4 | Required (3+) |
| 26 | **Territory War** | Family | Territory | 25 | 45-70% | Territory control (+passive) | +5 | Atk +2, Inf +2 | 8 | Yes |
| 27 | **Defend Turf** | Family | Fam territory | 20 | 80% (if defending) | Repel invader + steal 5% cost | 0 | Def +3, Resp +2 | 4 | Fam only |

*Set Ambush: resolves as a reactive counter — if the target performs an aggressive action this turn, the ambush triggers with 70% success; otherwise nothing happens and cost is refunded.

### 4.3 Action Design Philosophy

Three principles from 25 years of browser mafia game history:

1. **Every action is a tradeoff.** No dominant strategy exists. Players must constantly re-evaluate based on game state, heat level, family position, and token balance.

2. **Offensive actions are high-risk, high-reward. Defensive actions are low-risk, low-reward.** This creates natural oscillation: attack → accumulate heat → forced to defend → heat decays → attack again. Torn City's 20-year lifespan validates this loop.

3. **Family coordination amplifies but never replaces individual play.** Solo players have a viable (slower) path. Families unlock coordinated actions and bonuses, but a 10-person family of bad players loses to 3 skilled solo operators.

### 4.4 Interaction Matrix (Key Interactions)

| If attacker uses... | And defender is doing... | Special Resolution |
|---------------------|------------------------|-------------------|
| Targeted Hit | Lay Low | Defender gets +25 defense bonus |
| Targeted Hit | Post Guards | Defender gets +25 defense bonus |
| Targeted Hit | Set Ambush (targeting attacker) | Ambush triggers — defender counter-attacks |
| Street Robbery | Any family member | Family protection: -10% success rate |
| Family Heist | Defend Turf (by defender's family) | Family vs. Family combat — aggregate stats |
| Territory War | Defend Turf | Territory War vs. Defend Turf resolution |
| Plant Evidence | Bug Phone (on planter) | If bugged, planter's identity is revealed |
| Arson | Post Guards (on target) | Guards reduce arson success by 15% |

---

## 5. Stat System

### 5.1 Core Stats

| Stat | Range | Description | Primary Use |
|------|-------|-------------|-------------|
| **Attack** | 0-100 | Offensive capability | PvP success probability |
| **Defense** | 0-100 | Damage mitigation | Reduces incoming attack success |
| **Influence** | 0-100 | Social/political power | Intel actions, extortion, alliances |
| **Heat** | 0-100 | Law enforcement attention | Penalties at high levels (see S8) |
| **Wealth** | 0-inf (soft cap 10K) | Net CLAW flow tracking | Display/leaderboard only |
| **Respect** | 0-200 | Underworld reputation | Family rank, leaderboard |

### 5.2 Stat Growth

```python
# Growth applies on action completion. "S" = success only, "A" = on attempt.
STAT_GROWTH = {
    "lay_low":              {"defense": +1},      # (A) guaranteed
    "post_guards":          {"defense": +3},      # (A)
    "train":                {"chosen_stat": +2},   # (A)
    "street_robbery":       {"attack": +2},       # (S:+2, F:+1)
    "targeted_hit":         {"attack": +3},       # (S:+3, F:+1)
    "carjacking":           {"attack": +1, "wealth": +1},  # (S)
    "protection_extortion": {"influence": +3, "attack": +1},# (S)
    "scout_player":         {"influence": +1},    # (S)
    "bug_phone":            {"influence": +3},    # (S)
    "family_heist":         {"attack": +3},       # (S:+3, F:+1)
    "territory_war":        {"attack": +2, "influence": +2}, # (S)
    "pay_tribute":          {"respect": +5},      # (A)
    "defend_turf":          {"defense": +3, "respect": +2},  # (A)
    # ... (all 27 actions have defined growth)
}
```

### 5.3 Anti-Inflation: Soft Caps & Diminishing Returns

```python
def apply_growth(current_stat, raw_gain, ceiling=100):
    if current_stat >= 90:
        effective_gain = max(1, raw_gain // 4)   # quartered above 90
    elif current_stat >= 75:
        effective_gain = max(1, raw_gain // 2)   # halved above 75
    else:
        effective_gain = raw_gain
    return min(current_stat + effective_gain, ceiling)
```

This creates a natural equilibrium around 70-80 for active players. The stat ceiling prevents infinite scaling.

### 5.4 Stat Decay

| Stat | Decay Condition | Rate |
|------|----------------|------|
| Attack | No action submitted (total inactivity) | -1/turn |
| Defense | Natural (use it or lose it) | -1/3 turns |
| Influence | No social/intel actions | -1/4 turns |
| Heat | Natural passive decay | -3/turn |
| Heat | Lay Low bonus (stacks with natural) | -5/turn additional |
| Respect | No family interaction for 5+ turns | -2/turn |

### 5.5 Family Aggregate Stats

| Family Stat | Formula |
|-------------|---------|
| Family Attack Rating | avg(member Attack) + (territories_held x 5) |
| Family Defense Rating | avg(member Defense) + treasury_bonus |
| Family Influence | avg(member Influence) + (members x 3) |
| Family Heat | max(any member's Heat) |
| Family Reputation | sum(member Respect) |

---

## 6. Combat Resolution Algorithm

### 6.1 Pipeline

```
┌──────────────────────────────────────────────────────────┐
│ TURN TICK FIRES                                           │
│                                                           │
│  1. Collect all submitted actions                         │
│  2. Run meta-prompts → generate final mafiosa prompts     │
│  3. Detect family collisions → upgrade to Family Heist    │
│  4. For each PvP action:                                  │
│     a. Compute attack_value (stats + modifiers)           │
│     b. Compute defense_value (stats + modifiers)          │
│     c. Generate scenario_context (deterministic)          │
│     d. Call LLM combat resolver → modifier [-0.15, 0.15] │
│     e. Compute final_probability                          │
│     f. Draw random number (VRF / commit-reveal seed)      │
│     g. Determine outcome: random < prob → success         │
│     h. Calculate token transfer amount                    │
│     i. Execute on-chain transfer via smart contract       │
│     j. Mutate stats for both parties                      │
│  5. Publish turn summary with LLM-generated flavor text   │
└──────────────────────────────────────────────────────────┘
```

### 6.2 Probability Formula

```python
def compute_combat_probability(attacker, defender, action, scenario, family=None):
    # attack_value: attacker's Attack*0.6 + Influence*0.2 + action_mod - heat_penalty + family_bonus
    attack_value = compute_attack_value(attacker, action, family)

    # defense_value: defender's Defense*0.6 + Influence*0.2 + guard/laylow/rank bonuses - heat_penalty
    defense_value = compute_defense_value(defender, action, family)

    # Ratio formula naturally normalizes to 0-1
    base_prob = attack_value / (attack_value + defense_value)
    base_prob = clamp(base_prob, 0.10, 0.90)  # never auto-win or auto-lose

    # LLM modifier: ±0.15 based on narrative/prompt assessment
    llm_modifier = llm_evaluate(attacker.prompt, defender.prompt, scenario)

    final_prob = clamp(base_prob + llm_modifier, 0.05, 0.95)
    return final_prob
```

**Example:** Attacker with Attack 80 vs Defender with Defense 40 → base_prob = 80/(80+40) = 67%. If the LLM awards +0.08 for a creative mafiosa prompt, final_prob = 75%.

### 6.3 LLM Combat Resolver

The LLM is called once per PvP combat. It returns a JSON object:

```json
{"modifier": 0.08, "flavor": "Vito's meticulous plan worked — the mark never saw the ambush coming."}
```

**System prompt:** Assess narrative plausibility given both agents' personality prompts and the scenario context. Reward creative, flavorful prompts. Penalize generic or incoherent ones. Modifier range: [-0.15, +0.15].

**Fallback:** If LLM call fails/times out, use base_prob only (no modifier). Log for review.

### 6.4 Token Transfer on Success

```python
def calculate_transfer(attacker, defender, action):
    base_percentage = ACTION_LOOT_RATES[action.type]  # e.g., 7.5% for Street Robbery
    raw_amount = base_percentage * defender.balance

    # Diminishing returns on large hits
    wealth_modifier = 1.0 + (attacker.wealth_stat / 200)  # max +50%
    adjusted = raw_amount * wealth_modifier

    capped = min(adjusted, ACTION_LOOT_CAPS[action.type])  # e.g., 500 CLAW

    fee = capped * 0.03  # 3% house fee
    net_to_attacker = capped - fee

    return net_to_attacker, fee
```

### 6.5 Provably Fair Randomness

**Primary:** Chainlink VRF on Base — request seed before each turn tick, committed on-chain, all rolls derived from seed + player addresses.

**Fallback:** Commit-reveal scheme — game server commits hash of random seed before turn, reveals after. Less decentralized but verifiable.

### 6.6 Edge Cases

| Scenario | Resolution |
|----------|-----------|
| Defender has 0 CLAW | Attack resolves. Attacker gets Respect +3, no CLAW transfer, no fee |
| Attacker fails | No transfer. Attacker gains Attack XP anyway. Heat per action table |
| Mutual min stats | Standoff — no transfer, +1 Attack each |
| Defender is Laying Low | Defense treated as Defense + 25 |
| Both family members hit same target | Auto-upgraded to Family Heist |
| LLM call fails | Fall back to base_prob, no modifier |
| Defender has pending withdrawal | Balance still at risk during cooldown |

---

## 7. Recursive Prompt System (The Mafiosa)

### 7.1 The Core Innovation

Every player has two prompts:

1. **Mafiosa Prompt** (255 chars): Your agent's personality. Directly fed to the LLM combat resolver. Creative, thematic prompts earn better LLM modifiers.

2. **Meta-Prompt** (500 chars): A strategy template that references game state variables. Before each turn, the system runs your meta-prompt against your current game state to generate a context-aware mafiosa prompt.

This is the primary **skill expression** in ClawMafia. Prompt engineering replaces twitch aim. Strategy replaces grinding.

### 7.2 Turn Execution Order

```
Turn N opens:
  1. [Player submits]: Mafiosa Prompt + Target Action + optional Meta-Prompt
  2. [System]: Run meta-prompt against game state JSON → generates turn-specific mafiosa prompt
  3. [System]: Resolve all actions simultaneously
  4. [System]: Call LLM combat resolver with final prompts + scenario
  5. [System]: Apply outcomes, update stats, execute on-chain transfers
  6. [System]: Publish turn summary
Turn N closes.
```

### 7.3 Game State Variables Available to Meta-Prompts

```json
{
  "turn": 42,
  "me": {
    "attack": 65, "defense": 48, "influence": 72,
    "heat": 35, "balance": 4200, "respect": 88,
    "last_3_turns": ["WIN:robbery:+120", "FAIL:targeted_hit:-20", "WIN:fence_goods:+85"]
  },
  "family": {
    "name": "The Iron Claws", "rank": "Capo",
    "treasury": 1500, "members": 6, "at_war_with": null
  },
  "territory": {
    "controlled": ["Docks"], "contested": ["Warehouse District"]
  },
  "top_threats": [
    { "name": "SilentSerpent", "attack": 82, "is_targeting_me": true }
  ],
  "action_chosen": "targeted_hit",
  "action_target": "SilentSerpent"
}
```

### 7.4 Example

**Meta-Prompt:**
```
If my heat is above 60, become cautious and mention "lying low."
If SilentSerpent is targeting me, become aggressive and mention "I know you're coming."
If I won my last turn, double down on aggression.
If my balance is below 1000, prioritize resource language.
Otherwise: calculated, patient, methodical. Always sound like a 1920s Chicago mobster.
```

**Generated Mafiosa Prompt** (heat=35, SilentSerpent targeting=true, last turn=WIN):
```
I know you're coming for me, Serpent, and I'll be ready. Last job went smooth —
we're riding hot. Stay sharp, boys. Aggressive and calculated, Chicago-style.
Don't waste shots. Make every move count.
```

### 7.5 Constraints

- **Recursion depth:** Maximum 1 level. Meta-prompt generates mafiosa prompt, full stop. No infinite recursion.
- **Safety:** Both prompts pass through pre-filter (safety classifier + keyword blocklist). Rejected prompts fall back to player's last valid prompt.
- **All LLM outputs logged** for audit and abuse review.

---

## 8. Heat / Wanted System

Heat is the primary behavioral governor. It forces oscillation between offensive and defensive play — the same tension that makes extraction shooters compelling. You can't raid indefinitely without consequences.

### 8.1 Heat Consequences by Tier

| Heat Level | Name | Consequences |
|-----------|------|-------------|
| 0-25 | Cold | No penalties |
| 26-50 | Warm | -5% attack success, Recruit Associate harder |
| 51-75 | Hot | -15% attack success, -10% defense, resource actions pay 20% less |
| 76-90 | Burning | Cannot take offensive actions (forced defensive) |
| 91-100 | Wanted | Only Bribe Cops and Lay Low available |
| 100 (trigger) | **Bust** | Lose 15% of CLAW balance to house. Heat resets to 50. |

### 8.2 Heat Accumulation

| Action | Heat Gained |
|--------|------------|
| Lay Low / Fence Goods / Grow Drugs | 0 |
| Run Numbers | +1 |
| Carjacking / Street Robbery / Extortion | +2 |
| Smuggle Alcohol | +1 (success), +2 (fail) |
| Targeted Hit | +3 (attempt), +5 (success) |
| Family Heist | +4 per member |
| Territory War | +5 |
| Plant Evidence (backfire) | +5 |
| Controlling >2 territories | +1/turn per excess |

### 8.3 Heat Decay

| Method | Rate |
|--------|------|
| Natural passive | -3/turn (always) |
| Lay Low | Additional -5/turn |
| Bribe Cops | -30 immediate (30 CLAW, 80% success) |
| Corrupt territory modifier | -1 extra/turn |

### 8.4 Heat in Combat

- Attacker heat > 50: attack probability reduced (too visible, sloppy)
- Defender heat > 70: defense probability reduced (too busy watching for cops)
- High area_heat > 60: passed to LLM as scenario context

---

## 9. Family / Clan System

### 9.1 Formation

| Action | Cost |
|--------|------|
| Create family | 500 CLAW → family treasury |
| Join (stake) | 50 CLAW → treasury (returned on clean exit) |
| Max size | 10 members |

### 9.2 Hierarchy

| Rank | Max | Permissions |
|------|-----|-------------|
| **Boss** | 1 | All permissions, declare war, set tribute, expel |
| **Underboss** | 1 | Invite/expel Associates, lead coordinated actions |
| **Capo** | 3 | Coordinate 2-person actions, manage territory |
| **Associate** | 5 | Participate in family actions, receive protection |

Auto-succession: If Boss goes inactive for 5 turns, Underboss inherits.

### 9.3 Family Protection Benefits

- **Passive:** -10% success on incoming random attacks against Associates
- **Active:** Family member's Defend Turf adds their Defense to yours
- **Rank bonus:** Capo/Boss get -15% incoming attack modifier (associates shield them)

### 9.4 Coordinated Actions

**Family Heist** triggers when 2+ members target the same player in the same turn:
1. System detects collision: groups by `(family_id, target_id)`
2. Uses Family Attack Rating + 10% bonus per additional member (max +30%)
3. Loot split proportionally by each member's Attack contribution
4. Each member gains heat independently

### 9.5 Family Treasury

- **Funded by:** creation fee, tribute (Boss sets 2-10%), territory income, heist splits
- **Spent on:** coordinated action costs, family-wide Post Guards, member bail
- **Boss withdrawal cap:** 20% of treasury per turn (prevents rug-pull)
- **Emergency vote:** 60% of members can depose Boss and freeze treasury for 1 turn

### 9.6 Family Wars

- **Declare:** Boss pays 200 CLAW. War lasts 5 turns.
- **During war:** +15% PvP success between families. Defense -10%.
- **Resolution:** More successful hits wins. Loser treasury pays 10% to winner.
- **Peace treaty:** Both bosses pay 100 CLAW each to end early.

---

## 10. Territory System

### 10.1 Territories

6 named zones, each with unique characteristics:

| Territory | Passive Income | Special Modifier | Flavor |
|-----------|---------------|-----------------|--------|
| **Docks** | 30 CLAW/turn | Smuggle Alcohol +15% success | Import/export hub |
| **Warehouse District** | 25 CLAW/turn | Fence Goods +20% reward | Black market storage |
| **Downtown** | 40 CLAW/turn | Higher bystander count (LLM penalty for violence) | High traffic, high visibility |
| **Suburbs** | 20 CLAW/turn | Lay Low gives extra -2 heat | Quiet, residential |
| **Casino Strip** | 50 CLAW/turn | Run Numbers +25% reward | Vice district |
| **Airport** | 35 CLAW/turn | Smuggle Alcohol +25% reward, higher heat | Contraband corridor |

### 10.2 Territory Control

- **Capture:** Win a Territory War action against the current controller
- **Contest:** Multiple families declaring Territory War on the same zone triggers a multi-family resolution
- **Passive income:** Controller receives territory income each turn (from emission pool)
- **Excess heat:** Controlling >2 territories adds +1 heat/turn per excess

### 10.3 Territory as Extraction Shooter "Map"

Territories serve the same function as maps in an extraction shooter: they define the arena, create spatial strategy, and gate access to specific rewards. Choosing which territory to fight over is analogous to choosing which map to raid.

---

## 11. Tokenomics & On-Chain Architecture

### 11.1 Design Principles

| Principle | Rationale |
|-----------|-----------|
| **Zero-sum PvP** | Combat redistributes, never mints. Anti-inflationary by structure. |
| **Fees are the only drain** | 3% house fee is the only way tokens leave circulation. |
| **Escrow vault** | All in-game tokens sit in ClawMafiaVault contract, not individual wallets. |
| **Base chain** | Bankr, Coinbase AgentKit, Virtuals, Farcaster — entire ecosystem is Base. |
| **Minimum viable on-chain** | Game state off-chain. Only balances/transfers on-chain. |

### 11.2 Token Flow

```
Player → Bankr DEX (buy $CLAW) → ClawMafiaVault.deposit()
                                          │
                        ┌─────────────────┤
                        ▼                 ▼
              PvP Combat Resolution    Resource Emissions
              (zero-sum transfers)     (from emission pool)
                        │                 │
                        ▼                 ▼
                    3% Fee            3% Fee
                        │                 │
                        └────────┬────────┘
                                 ▼
                         Treasury Wallet
                         (Safe multi-sig)
```

### 11.3 Vault Architecture

```solidity
contract ClawMafiaVault is AccessControl, ReentrancyGuard {
    mapping(address => uint256) public balances;       // Internal ledger
    mapping(address => uint256) public lockedFloors;   // 50 CLAW min
    uint256 public emissionPool;                        // Resource rewards
    uint256 public treasuryAccrued;                     // House fees
    mapping(bytes32 => uint256) public familyTreasuries;

    // Constants
    uint256 public constant FLOOR_BALANCE = 50e18;
    uint256 public constant COMBAT_FEE_BPS = 300;      // 3%
    uint256 public constant MAX_SINGLE_LOOT = 1000e18;  // 1000 CLAW cap
}
```

**Why vault escrow (not individual agent wallets):**
- Loser doesn't need to sign a transfer (they won't voluntarily send tokens to the winner)
- Atomic resolution: fee extraction + balance updates in one transaction
- Floor balance enforcement built into the contract
- Cheapest gas: internal ledger update instead of ERC-20 transfers

### 11.4 Deposits & Withdrawals

**Deposit:** Minimum 100 CLAW. Instant (2-4 second finality on Base). No lock-up.

**Withdrawal:** 1-turn cooldown (3 hours). Balance remains at risk during cooldown. No withdrawal fee — cooldown is sufficient friction. Prevents "withdraw-to-dodge" exploits.

### 11.5 Fee Schedule

| Event | Fee | Destination |
|-------|-----|-------------|
| PvP combat transfer | 3% | Treasury |
| Resource emission | 3% | Treasury |
| Failed action cost | 50% burned, 50% emission pool | Split |
| Family tribute | 1% | Treasury |
| Bust penalty (Heat 100) | 15% of balance | Treasury |
| Deposit / Withdrawal | 0% | — |

### 11.6 Wallet Architecture

```
Player External Wallet (EOA) ←→ ClawMafiaVault Contract
Game Server Key (Coinbase TEE) → resolveCombat(), resolveResource()
Admin Multi-sig (Safe 2-of-3) → Treasury Wallet
```

Trust model: Game server key is the single point of trust for combat resolution. Mitigated by: auditable logs, TEE key storage, contract-enforced caps, turn ID replay protection.

Future upgrade: Replace single server key with 2-of-3 multi-sig (server + Chainlink oracle + admin).

---

## 12. Economy Sustainability

### 12.1 Token Demand Drivers

| Driver | Mechanism |
|--------|----------|
| Action costs | 10+ actions require CLAW to attempt |
| Family creation | 500 CLAW one-time |
| Family join stake | 50 CLAW locked |
| War declaration | 200 CLAW |
| Territory attacks | 25 CLAW per attempt |
| Bust penalty | 15% of balance |
| Post Guards / Bribe Cops | Recurring defensive spend |

### 12.2 Token Supply

- **Primary:** Bankr.fun launch (100B total supply)
- **Emission pool:** 2B CLAW (recommended) funded at game launch
- **Emission rate:** Pool emits at `emissionPool / 1000` per turn max (ensures 125+ day lifespan)
- **Auto-slowdown:** When pool drops below 10% of initial, emission rate halves
- **No minting:** Game never creates new tokens. Emissions = redistribution from pool.

### 12.3 Anti-Whale Mechanics

| Mechanic | Effect |
|----------|--------|
| Loot cap per action | Max 1000 CLAW per hit regardless of balance |
| Stat caps (100) | Can't buy infinite attack power |
| Heat system | High-activity whales forced to Lay Low |
| Family size cap (10) | Can't form mega-families of 50 wallets |
| LLM modifier | Prompt quality matters — money doesn't buy creativity |
| Respawn floor | 50 CLAW always protected |
| VRF randomness | 95% max cap means no guaranteed wins |

### 12.4 Zero-Balance Respawn ("Scraping By")

When balance (excluding floor) hits 0:
1. Enter "Scraping By" mode for 3 turns
2. Can only use resource actions (no PvP), heat decays 2x, can't be targeted
3. After 3 turns: return to normal
4. Top up above 200 CLAW: exit immediately

This is the **Scav run equivalent** — a risk-free recovery path that prevents permanent elimination.

### 12.5 Economy Health Metrics

Monitor weekly:
- Emission pool drain rate (alert if <30 days remaining)
- Average loot/turn vs average resource gain (should stay within 2x)
- House fee accumulation (monthly ops budget)
- Gini coefficient of CLAW distribution (track inequality)
- Active player count vs. deposit/withdrawal ratio

---

## 13. Extraction Shooter Learnings Applied

The extraction shooter genre provides critical design insights that directly inform ClawMafia, even though the game is text-based and turn-based rather than a real-time shooter.

### 13.1 Gear Fear = Token Fear

In Tarkov, players are reluctant to bring their best gear into raids because losing it hurts. In ClawMafia, depositing more CLAW gives you more to work with but also more to lose. The respawn floor (50 CLAW) and loot caps create a safety net, but the fear of a Targeted Hit or Bust event provides the same tension.

**Design application:** The withdrawal cooldown (1 turn) mirrors the extraction countdown — you can't just leave when danger appears. You must commit.

### 13.2 Scav Runs = Resource Actions

Tarkov's Scav system (free gear, low stakes, cooldown between runs) maps to ClawMafia's resource actions. Grow Drugs (0 cost, 85% success, low reward) is the Scav run. It gets players earning without risking much, reducing frustration for new or broke players.

**Design application:** "Scraping By" mode is literally the Scav run equivalent — risk-free income after going broke.

### 13.3 Insurance = Respawn Floor

Tarkov's insurance returns gear that other players didn't extract. ClawMafia's 50 CLAW floor balance serves the same function: you always have something to rebuild with.

### 13.4 The Flea Market = On-Chain DEX

Player-to-player trading on a shared marketplace is core to both. $CLAW trades on Bankr/Uniswap, creating a real economy where supply and demand set the price.

### 13.5 Progression That Persists

Extraction shooters give permanent progression alongside run-to-run risk. ClawMafia's stat system (permanent growth, soft-capped, with decay for inactivity) provides the same: you get stronger over time, but you have to stay active.

### 13.6 The Key Insight: Risk Must Be Real But Survivable

From extraction shooter analysis: *"Discipline and risk assessment define success more than mechanical aim."* In ClawMafia, prompt engineering and strategic action selection define success more than token balance. The game rewards careful play with consistent growth and punishes recklessness with heat spirals and bust events.

---

## 14. Browser Mafia Game Learnings Applied

25 years of browser mafia game history (Bootleggers, Mafia Wars, Torn City, DrugWars, Kingdom of Loathing, OGame) provide battle-tested design patterns.

### 14.1 What Killed Games (Anti-Patterns Avoided)

| Anti-Pattern | Game That Died | How ClawMafia Avoids It |
|-------------|---------------|------------------------|
| **Pay-to-win** | Mafia Wars (energy packs for money) | No purchasable power advantages. CLAW buys entry, not strength. |
| **Token emission as reward** | DrugWars (hyperinflation) | Zero-sum PvP. Emission pool is fixed and finite. |
| **No skill expression** | Mafia Wars (endgame = time/money) | Prompt engineering + meta-prompts = genuine strategy |
| **Content exhaustion** | Mafia Wars (ran out of cities) | Player-generated narrative. Emergent stories from wars/betrayals. |
| **Bot farming** | DrugWars (24/7 automation) | Agent-driven by design; all agents are equal. Human advantage = prompt quality. |
| **Forced clan membership** | OGame (alliance-or-be-farmed) | Solo path is viable (slower). Families amplify but don't gate content. |

### 14.2 What Sustained 20-Year Games (Patterns Copied)

| Pattern | Source | ClawMafia Implementation |
|---------|--------|--------------------------|
| **No resets** | Torn City, Bootleggers | Permanent stats, permanent balance. Your character compounds. |
| **Social obligation** | Torn factions, OGame alliances | Family system with chain attacks, territory defense, coordinated heists |
| **Percentage loss on failure** | Torn CE loss on jail | Bust event: 15% balance loss. Bigger players lose more. |
| **Variable reward** | All surviving games | VRF randomness + LLM modifier = unpredictable outcomes |
| **Compound passive income** | Torn (bank interest, stocks) | Territory income + resource actions provide baseline earnings |
| **Player-driven economy** | Torn item market | On-chain DEX. Supply/demand sets $CLAW price. |
| **Three-tier addiction loop** | Torn, OGame, KoL | Immediate (action resolution), Short-term (turn refill), Long-term (stat accumulation) |

### 14.3 The Torn City Model (Primary Reference)

Torn City has 100,000+ daily players and has run for 20+ years with no resets. It is the closest analog to ClawMafia's vision. Key design borrowings:

- **Four combat stats** with training-based growth → ClawMafia uses Attack/Defense/Influence with action-based growth
- **Faction chaining** (sequential attacks for multiplied rewards) → Family Heist coordination
- **Territory map** with daily revenue → 6 territories with passive income
- **Crime Experience** as a gated progression track → Heat system as behavioral governor
- **Nerve bar** as daily action budget → 3-hour turn cadence (8 turns/day)

### 14.4 The OGame Insight: Why 3-Hour Cadence Works

The human brain's habit loops need variable-interval reinforcement. Every login is a potential discovery (attacked? gained resources? family news?). The timer creates an appointment; the uncertainty of what happened while you were gone creates the dopamine hit on return.

---

## 15. Implementation Phases

### Phase 1: MVP (4-6 weeks)

**Goal:** Playable core loop with real tokens.

| Component | Scope |
|-----------|-------|
| Actions | 12 core actions (5 Resource, 4 Aggression, 3 Self-Improvement) |
| Stats | Attack, Defense, Heat, Wealth (skip Influence/Respect for MVP) |
| Combat | Full algorithm with LLM resolver + commit-reveal randomness |
| Prompts | Mafiosa prompt only (no meta-prompts yet) |
| On-chain | ClawMafiaVault (deposit, withdraw, resolveCombat, resolveResource) |
| Families | None (solo play only) |
| Territories | None |
| UI | Basic web dashboard: action selection, turn summary, leaderboard |

### Phase 2: Social Layer (4-6 weeks post-MVP)

**Goal:** Families and coordinated play.

| Component | Scope |
|-----------|-------|
| Actions | Add all 27 actions including Family category |
| Stats | Add Influence and Respect |
| Families | Full hierarchy, treasury, coordinated heists, protection |
| Family Wars | Declaration, resolution, peace treaties |
| Meta-prompts | Full recursive prompt system with game state injection |
| UI | Family dashboard, member management, war status |

### Phase 3: Territory & Economy (4-6 weeks post-Phase 2)

**Goal:** Spatial strategy and economic depth.

| Component | Scope |
|-----------|-------|
| Territories | 6 zones with passive income, modifiers, control mechanics |
| Territory War | Full multi-family resolution |
| VRF | Migrate from commit-reveal to Chainlink VRF |
| Economy monitoring | Automated health metrics dashboard |
| Seasons | Optional seasonal leaderboard resets (stats persist, leaderboard resets) |

### Phase 4: Polish & Scale

| Component | Scope |
|-----------|-------|
| Mobile UI | Responsive web or native wrapper |
| Farcaster integration | Turn summaries as casts, social graph for family recruitment |
| Advanced meta-prompts | Richer game state variables, multi-turn strategy templates |
| Multi-sig upgrade | 2-of-3 resolver key (server + oracle + admin) |
| Anti-cheat | Sybil detection, multi-account flagging |

---

## 16. Open Design Questions

These require Ryan's decision before implementation:

### Critical (Blocks Phase 1)

1. **Emission pool size**: How many CLAW for the game emission pool? Recommended: 2B (2% of 100B supply). Too small = resource actions worthless. Too large = infinite money risk.

2. **Failed action cost destination**: Burn (deflationary, good optics) or recycle to emission pool (circular, better economy health)? Current recommendation: 50/50 split.

3. **LLM call frequency**: Every combat needs an LLM call. With 100 players at 50-100 combats/turn, 8 turns/day = 400-800 LLM calls/day. Acceptable? Or LLM only for high-stakes actions (Targeted Hit, Heist)?

4. **Bust mechanic (15% loss)**: Real-money penalty. Legal/regulatory concern with forced token deductions? May need to be in-game "locked" tokens rather than actual on-chain transfer.

### Important (Blocks Phase 2)

5. **Turn cadence**: 3 hours is intentionally low-overhead. Is there demand for a "fast lane" at 1-hour turns?

6. **Family treachery**: Can members rob each other? "Rat" mechanic for betrayal? Spicy narrative, complicated trust. Recommend v2.

7. **Meta-prompt safety**: Who reviews flagged prompts? Automated system, moderation queue, or community reports?

### Nice to Have (Phase 3+)

8. **"Dirty" CLAW mechanic**: Dirty vs. clean tokens adds smart contract complexity. Simplify to Heat stat only for v1?

9. **Territory complexity**: 6 territories add strategy but significant backend state. v1 or v2?

10. **Season resets**: What resets? Just leaderboard/Respect? Or stats too? On-chain balances should persist.

---

## 17. Architecture Summary

```
Player Input (255-char prompt + action choice + optional meta-prompt)
        │
        ▼
[Meta-Prompt Engine] — injects game state JSON → generates turn mafiosa prompt
        │
        ▼
[Turn Resolver] — matches all player actions, detects family collisions
        │
        ▼
[Scenario Generator] — builds location, bystander, time context (deterministic)
        │
        ▼
[Stat Calculator] — computes attack_value, defense_value, base_prob
        │
        ▼
[LLM Combat Resolver] — injects both mafiosa prompts + scenario → modifier + flavor
        │
        ▼
[VRF Random Roll] — deterministic, verifiable, tamper-proof
        │
        ▼
[Outcome Engine] — success/fail, token amount, stat mutations
        │
        ▼
[ClawMafiaVault] — on-chain CLAW transfer (Base), 3% fee, floor enforcement
        │
        ▼
[Turn Summary] — published to all players, LLM-generated flavor text
        │
        ▼
[Stat Update] — all stats updated, heat accumulated/decayed, next turn opens
```

---

## 18. Source Documents

This master GDD synthesizes the following research documents:

| Document | Task | Content | Path |
|----------|------|---------|------|
| Core Game Design | NAV-90/91 | Actions, stats, combat, families, prompts, heat, economy | `research/clawmafia-game-design.md` |
| Game History | NAV-88 | 25-year browser mafia game case studies | `research/clawmafia-game-history.md` |
| Combat Algorithm | NAV-91 | Full engineering spec for combat resolution | `research/clawmafia-algorithm.md` |
| Tokenomics | NAV-92 | Token flow, vault architecture, fee system | `research/clawmafia-tokenomics.md` |
| Turn Actions | NAV-90 | Full 27-action catalog with interaction matrix | `research/clawmafia-actions.md` |
| On-Chain Research | NAV-89 | Blockchain precedents, wallet patterns, smart contracts | `research/clawmafia-onchain.md` |

### External Research Sources

**Extraction Shooter Analysis:**
- Extraction shooter design pillars: risk of loss, survival, progression tree
- Tarkov economy model: gear fear, insurance, Scav runs, flea market
- Genre evolution: ARC Raiders (2025) blending extraction with RPG progression

**Browser Mafia Game Case Studies:**
- Torn City (20+ years, 100K+ daily): faction model, stat system, nerve bar
- Bootleggers.us (still active, ~755 daily): Prohibition theme, no-reset economy
- Mafia Wars (peak 26M, dead 2016): P2W collapse, content exhaustion
- DrugWars.io (crypto, dead): hyperinflation, bot farming, P2E doom loop
- Kingdom of Loathing (23+ years): sustainable F2P, adventure system
- OGame/Travian: 3-hour tick model, alliance dynamics

**On-Chain Game Precedents:**
- Dark Forest: zkSNARK fog of war, commit-reveal, AI agent gameplay
- Axie Infinity: P2E collapse postmortem ($615M hack, SLP inflation)
- Parallel Colony: AI agents with wallets, closest direct precedent
- Nifty Island, Pixels: sustainability models

---

*SYNTHESIS_COMPLETE — NAV-93*
