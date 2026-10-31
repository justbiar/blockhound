// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {HashMint, IPriceFeed, IAgentRegistry} from "./HashMint.sol";

/// @title HOUND
/// @notice Blockhound topluluk tokenı. Ön basım, ekip payı ya da sahip yoktur: her HOUND bir iş kanıtıyla basılır.
/// Yalnızca Binance Agent ID sahibi cüzdanlar mintleyebilir. Bir çözüm 10.000 HOUND verir.
/// Zorluk her 1.000 mintte (10 milyon HOUND) bir bit artar.
contract Hound is ERC20, HashMint {
    uint256 public constant REWARD = 10_000 ether;

    constructor(
        IPriceFeed feed,
        IAgentRegistry registry,
        address treasury_,
        uint256 feeUsd_,
        uint256 epochSize_,
        uint256 startBits_
    )
        ERC20("Hound", "HOUND")
        HashMint(feed, registry, treasury_, feeUsd_, epochSize_, startBits_)
    {}

    function mint(uint256 nonce) external payable {
        _mintWork(nonce);
    }

    function _award(address to, uint256, uint256, bytes32) internal override {
        _mint(to, REWARD);
    }
}
