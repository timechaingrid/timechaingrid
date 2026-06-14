% chain-tools/vault-grid/prolog/rules/coins.pl
%
% Hand-authored Prolog rules for the Grid coin vault.
% Schema reminder:
%   coin(CoinId, MintedAtBlock, MinterAddress, OwnerAddress, SpiralIndex).
%
% Auto-generated facts in vault-grid/prolog/facts/coins.pl. The rules
% here are sandbox-safe (no assert/retract, no system calls, no file
% I/O) so they're suitable for the eventual /v1/query API endpoint.
%
% This file is the canonical contract — committed to git via the
% gitignore carve-out — even though the rest of vault-grid/ is
% gitignored as auto-generated build output.

% --- Identity / mint accessors ----------------------------------------------

% mintee(Address, Block) — Address received a coinbase output at Block.
mintee(Address, Block) :- coin(_, Block, Address, _, _).

% minted_in(CoinId, Block) — convenience: CoinId was minted at Block.
minted_in(CoinId, Block) :- coin(CoinId, Block, _, _, _).

% --- Ownership accessors ----------------------------------------------------

% owns(Address) — Address currently owns at least one coin.
owns(Address) :- coin(_, _, _, Address, _).

% holds(Address, CoinId) — Address currently owns CoinId.
holds(Address, CoinId) :- coin(CoinId, _, _, Address, _).

% wallet_coin_count(Address, K) — K coins are currently owned by Address.
wallet_coin_count(Address, K) :-
    findall(C, coin(C, _, _, Address, _), Cs),
    length(Cs, K).

% --- Genesis lineage --------------------------------------------------------

% origin_coin(CoinId) — the (0, 0) coin at spiralIndex 0.
origin_coin(CoinId) :- coin(CoinId, _, _, _, 0).

% genesis_coin(CoinId) — any of Satoshi's 50 coins (block 0).
genesis_coin(CoinId) :- coin(CoinId, 0, _, _, _).

% genesis_owner(Address) — anyone who currently holds a genesis coin.
genesis_owner(Address) :- coin(_, 0, _, Address, _).

% --- Spiral neighbors -------------------------------------------------------

% spiral_neighbor(CoinId, NeighborId) — NeighborId is the coin one
% step earlier or later on the spiral.
spiral_neighbor(CoinId, NeighborId) :-
    coin(CoinId, _, _, _, Idx),
    Prev is Idx - 1,
    Prev >= 0,
    coin(NeighborId, _, _, _, Prev).
spiral_neighbor(CoinId, NeighborId) :-
    coin(CoinId, _, _, _, Idx),
    Next is Idx + 1,
    coin(NeighborId, _, _, _, Next).

% --- Halving relationships --------------------------------------------------

% halving_coin(CoinId) — CoinId was minted at a non-zero halving block.
% Pure arithmetic over MintedAtBlock; no halving flag stored on coin/5.
halving_coin(CoinId) :-
    coin(CoinId, Block, _, _, _),
    Block > 0,
    Block mod 210000 =:= 0.

% epoch_of_coin(CoinId, Epoch) — epoch (0..32) the coin was minted in.
epoch_of_coin(CoinId, Epoch) :-
    coin(CoinId, Block, _, _, _),
    Epoch is Block // 210000.

% --- Mint counts per address ------------------------------------------------

% mint_count(Address, K) — Address minted K coins (lifetime).
mint_count(Address, K) :-
    findall(C, coin(C, _, Address, _, _), Cs),
    length(Cs, K).

% all_minters(Minters) — sorted list of all coinbase recipients.
all_minters(Minters) :-
    findall(A, coin(_, _, A, _, _), Raw),
    sort(Raw, Minters).

% top_minter(Address, Count) — the most prolific minter and their
% lifetime mint count. Backtrack-free version: only the leader. Use
% mint_count/2 if you want a specific address's count.
top_minter(Address, Count) :-
    all_minters(Minters),
    findall(C-A, (member(A, Minters), mint_count(A, C)), Pairs),
    sort(0, @>=, Pairs, Sorted),
    Sorted = [Count-Address|_].

% --- Per-block density ------------------------------------------------------

% coins_in_block(Block, Count) — how many coins minted at Block.
% In v0.1 fixture this is uniformly 50 (epoch 0); past block 210k
% the value follows the halving schedule (25, 12.5 floored to 12, etc).
coins_in_block(Block, Count) :-
    findall(C, coin(C, Block, _, _, _), Cs),
    length(Cs, Count).

% --- Spiral ring geometry ---------------------------------------------------

% coin_ring(CoinId, K) — the concentric ring (Chebyshev distance from
% origin) containing CoinId. Ring 0 is the origin alone; ring K has
% 8K cells. Useful for "first 100 coins around Satoshi"-style queries.
coin_ring(CoinId, K) :-
    coin(CoinId, _, _, _, Idx),
    Idx >= 0,
    ( Idx =:= 0
    -> K = 0
    ;  K is integer(ceiling((sqrt(Idx + 1) - 1) / 2))
    ).

% --- Wealth thresholds ------------------------------------------------------

% rich_wallet(Address, MinCoins) — Address holds >= MinCoins coins.
% Use as e.g. rich_wallet(A, 1000) to find addresses with >= 1k coins.
rich_wallet(Address, MinCoins) :-
    wallet_coin_count(Address, N),
    N >= MinCoins.

% --- Block siblings ---------------------------------------------------------

% same_block_coins(CoinA, CoinB) — both coins were minted in the
% same block. Excludes the trivial reflexive case (CoinA = CoinB).
% v0.1: any two coins in this relation share a coinbase recipient
% since each block has exactly one miner; v0.2+ multi-coinbase
% experiments would relax that.
same_block_coins(CoinA, CoinB) :-
    coin(CoinA, Block, _, _, _),
    coin(CoinB, Block, _, _, _),
    CoinA \= CoinB.
