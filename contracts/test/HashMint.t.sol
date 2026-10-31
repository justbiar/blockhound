// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Hound} from "../src/Hound.sol";
import {BlockHound} from "../src/BlockHound.sol";
import {HashMint, IPriceFeed, IAgentRegistry} from "../src/HashMint.sol";

contract MockFeed is IPriceFeed {
    int256 public price = 700e8;
    uint256 public updatedAt = block.timestamp;

    function set(int256 p, uint256 t) external {
        price = p;
        updatedAt = t;
    }

    function decimals() external pure returns (uint8) {
        return 8;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, price, updatedAt, updatedAt, 1);
    }
}

contract MockRegistry is IAgentRegistry {
    mapping(address => uint256) public balanceOf;

    function set(address a, uint256 n) external {
        balanceOf[a] = n;
    }
}

contract HashMintTest is Test {
    MockFeed feed;
    MockRegistry registry;
    Hound hound;
    BlockHound nft;
    address treasury = makeAddr("treasury");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        vm.warp(1_700_000_000);
        feed = new MockFeed();
        registry = new MockRegistry();
        registry.set(alice, 1);
        registry.set(bob, 1);
        // Testte zorluk düşük ve dönem kısa: 8 bit, her 3 mintte bir artar
        hound = new Hound(feed, registry, treasury, 50_000_000, 3, 8);
        nft = new BlockHound(feed, registry, treasury, 10_000_000, 3, 8);
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
    }

    function _mine(HashMint c, address miner, uint256 from) internal view returns (uint256 n) {
        for (n = from;; n++) {
            (, bool ok) = c.check(miner, n);
            if (ok) return n;
        }
    }

    function test_FeeIsDollarPeggedInBnb() public view {
        assertEq(hound.mintFee(), uint256(50_000_000) * 1e18 / 700e8);
        assertEq(nft.mintFee(), uint256(10_000_000) * 1e18 / 700e8);
    }

    function test_MintGivesReward() public {
        uint256 n = _mine(hound, alice, 0);
        uint256 fee = hound.mintFee();
        vm.prank(alice);
        hound.mint{value: fee}(n);
        assertEq(hound.balanceOf(alice), 10_000 ether);
        assertEq(hound.minted(), 1);
        assertEq(address(hound).balance, fee);
        hound.withdraw();
        assertEq(treasury.balance, fee);
    }

    function test_RejectsWrongNonceAndReuse() public {
        uint256 n = _mine(hound, alice, 0);
        uint256 fee = hound.mintFee();
        (, bool ok) = hound.check(alice, n + 1);
        if (!ok) {
            vm.prank(alice);
            vm.expectRevert(HashMint.InvalidSolution.selector);
            hound.mint{value: fee}(n + 1);
        }
        vm.prank(alice);
        hound.mint{value: fee}(n);
        vm.prank(alice);
        vm.expectRevert(HashMint.SolutionUsed.selector);
        hound.mint{value: fee}(n);
    }

    function test_SolutionIsBoundToMiner() public {
        uint256 n = _mine(hound, alice, 0);
        (, bool okForBob) = hound.check(bob, n);
        vm.assume(!okForBob);
        uint256 fee = hound.mintFee();
        vm.prank(bob);
        vm.expectRevert(HashMint.InvalidSolution.selector);
        hound.mint{value: fee}(n);
    }

    function test_DifficultyRisesEachEpoch() public {
        bytes32 c0 = hound.challenge();
        uint256 fee = hound.mintFee();
        for (uint256 i; i < 3; i++) {
            uint256 n = _mine(hound, alice, i * 1_000_000);
            vm.prank(alice);
            hound.mint{value: fee}(n);
        }
        assertEq(hound.epoch(), 1);
        assertEq(hound.difficultyBits(), 9);
        assertEq(hound.target(), type(uint256).max >> 9);
        assertTrue(hound.challenge() != c0);
    }

    function test_FeeChecksAndRefund() public {
        uint256 n = _mine(hound, alice, 0);
        uint256 fee = hound.mintFee();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(HashMint.InsufficientFee.selector, fee));
        hound.mint{value: fee - 1}(n);

        uint256 before = alice.balance;
        vm.prank(alice);
        hound.mint{value: fee + 1 ether}(n);
        assertEq(before - alice.balance, fee);
    }

    function test_StalePriceStopsMint() public {
        feed.set(700e8, block.timestamp - 7 hours);
        vm.expectRevert(HashMint.StalePrice.selector);
        hound.mintFee();
        feed.set(0, block.timestamp);
        vm.expectRevert(HashMint.StalePrice.selector);
        hound.mintFee();
    }

    function test_NftMintAndOnchainMetadata() public {
        uint256 n = _mine(nft, alice, 0);
        uint256 fee = nft.mintFee();
        vm.prank(alice);
        nft.mint{value: fee}(n);
        assertEq(nft.ownerOf(1), alice);
        assertEq(nft.totalSupply(), 1);
        assertEq(nft.bitsOf(1), 8);
        string memory uri = nft.tokenURI(1);
        assertEq(bytes(uri).length > 600, true);
        assertEq(_startsWith(uri, "data:application/json;base64,"), true);
    }

    function test_OnlyAgentIdCanMint() public {
        address carol = makeAddr("carol");
        vm.deal(carol, 1 ether);
        assertFalse(hound.isAgent(carol));
        // Herkes arayabilir: Agent ID'si olmayan adres için de geçerli hash bulunur ama mint reddedilir
        uint256 n = _mine(hound, carol, 0);
        uint256 fee = hound.mintFee();
        vm.prank(carol);
        vm.expectRevert(HashMint.NotAgent.selector);
        hound.mint{value: fee}(n);
        registry.set(carol, 1);
        vm.prank(carol);
        hound.mint{value: fee}(n);
        assertEq(hound.balanceOf(carol), 10_000 ether);
    }

    function test_RegistryMustBeContract() public {
        vm.expectRevert(HashMint.BadFeed.selector);
        new Hound(feed, IAgentRegistry(makeAddr("eoa")), treasury, 50_000_000, 3, 8);
    }

    function test_ChallengeIsPerContract() public view {
        assertTrue(hound.challenge() != nft.challenge());
    }

    function _startsWith(string memory s, string memory p) internal pure returns (bool) {
        bytes memory a = bytes(s);
        bytes memory b = bytes(p);
        if (a.length < b.length) return false;
        for (uint256 i; i < b.length; i++) {
            if (a[i] != b[i]) return false;
        }
        return true;
    }
}
