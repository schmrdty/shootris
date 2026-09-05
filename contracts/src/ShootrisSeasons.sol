// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title ShootrisSeasons
/// @notice STAGED — not yet deployed. Season settlement for Shootris on Base.
///
/// The game itself runs off-chain: SpacetimeDB validates play and holds the
/// leaderboard. This contract only enters the picture if/when a season's
/// results should be settled on-chain:
///
///  - `postSeason` with merkleRoot=0 is a pure ATTESTATION: it permanently
///    records the hash of a season's final results. No tokens move.
///  - `postSeason` with a merkle root and prize escrows MYU for winners to
///    PULL via `claim` — the owner never pushes tokens to anyone.
///
/// NOTE: funding prizes means distributing MYU, with whatever tax
/// consequences that carries. Attestation-only use moves no value.
contract ShootrisSeasons {
    address public owner;
    IERC20 public immutable myu;

    struct Season {
        bytes32 resultsHash; // keccak256 of the full season results document
        bytes32 merkleRoot;  // root of (player, amount) prize leaves; 0 = attestation only
        uint256 totalPrize;  // MYU escrowed for this season
        uint64 claimDeadline; // unix time after which owner may sweep the rest
    }

    mapping(uint256 => Season) public seasons;
    mapping(uint256 => mapping(address => bool)) public claimed;

    event SeasonPosted(
        uint256 indexed seasonId,
        bytes32 resultsHash,
        bytes32 merkleRoot,
        uint256 totalPrize,
        uint64 claimDeadline
    );
    event Claimed(uint256 indexed seasonId, address indexed player, uint256 amount);
    event Swept(uint256 indexed seasonId, uint256 amount);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor(address myuToken) {
        require(myuToken != address(0), "zero token");
        owner = msg.sender;
        myu = IERC20(myuToken);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero owner");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @notice Post a season result. For attestation only, pass merkleRoot=0
    ///         and totalPrize=0. For prizes, approve this contract for
    ///         `totalPrize` MYU first; it is pulled into escrow here.
    function postSeason(
        uint256 seasonId,
        bytes32 resultsHash,
        bytes32 merkleRoot,
        uint256 totalPrize,
        uint64 claimDeadline
    ) external onlyOwner {
        require(seasons[seasonId].resultsHash == bytes32(0), "season exists");
        require(resultsHash != bytes32(0), "empty results");
        if (totalPrize > 0) {
            require(merkleRoot != bytes32(0), "prizes need a root");
            require(claimDeadline > block.timestamp, "deadline in past");
            require(myu.transferFrom(msg.sender, address(this), totalPrize), "funding failed");
        }
        seasons[seasonId] = Season(resultsHash, merkleRoot, totalPrize, claimDeadline);
        emit SeasonPosted(seasonId, resultsHash, merkleRoot, totalPrize, claimDeadline);
    }

    /// @notice Claim a season prize. Leaf = keccak256(abi.encodePacked(player, amount)).
    function claim(uint256 seasonId, uint256 amount, bytes32[] calldata proof) external {
        Season storage s = seasons[seasonId];
        require(s.merkleRoot != bytes32(0), "no prizes this season");
        require(block.timestamp <= s.claimDeadline, "claims closed");
        require(!claimed[seasonId][msg.sender], "already claimed");
        bytes32 leaf = keccak256(abi.encodePacked(msg.sender, amount));
        require(_verify(proof, s.merkleRoot, leaf), "bad proof");
        claimed[seasonId][msg.sender] = true;
        require(myu.transfer(msg.sender, amount), "transfer failed");
        emit Claimed(seasonId, msg.sender, amount);
    }

    /// @notice After the claim deadline, the owner may recover unclaimed MYU.
    function sweep(uint256 seasonId, uint256 amount) external onlyOwner {
        Season storage s = seasons[seasonId];
        require(s.merkleRoot != bytes32(0), "no prizes this season");
        require(block.timestamp > s.claimDeadline, "claims still open");
        require(myu.transfer(owner, amount), "transfer failed");
        emit Swept(seasonId, amount);
    }

    function _verify(bytes32[] calldata proof, bytes32 root, bytes32 leaf)
        private
        pure
        returns (bool)
    {
        bytes32 h = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 p = proof[i];
            h = h < p ? keccak256(abi.encodePacked(h, p)) : keccak256(abi.encodePacked(p, h));
        }
        return h == root;
    }
}
