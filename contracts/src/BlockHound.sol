// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {HashMint, IPriceFeed, IAgentRegistry} from "./HashMint.sol";

/// @title BlockHound
/// @notice İş kanıtıyla basılan NFT koleksiyonu. Yalnızca Binance Agent ID sahibi cüzdanlar mintleyebilir. Görsel tamamen zincir üstündedir ve madencinin bulduğu hash'ten
/// türetilir: renk, kulak tonu ve koklanan blok sayısı o hash'e bağlıdır. Zorluk her 250 mintte bir bit artar,
/// erken basılan köpeklerin zorluk biti düşüktür.
contract BlockHound is ERC721, HashMint {
    using Strings for uint256;

    mapping(uint256 => bytes32) public seedOf;
    mapping(uint256 => uint8) public bitsOf;

    constructor(
        IPriceFeed feed,
        IAgentRegistry registry,
        address treasury_,
        uint256 feeUsd_,
        uint256 epochSize_,
        uint256 startBits_
    )
        ERC721("BlockHound", "BHOUND")
        HashMint(feed, registry, treasury_, feeUsd_, epochSize_, startBits_)
    {}

    function mint(uint256 nonce) external payable {
        _mintWork(nonce);
    }

    function totalSupply() external view returns (uint256) {
        return minted;
    }

    /// @dev Kimlikler 1'den başlar. `_safeMint` değil `_mint`: alıcıya geri çağrı yapılmaz
    function _award(address to, uint256 index, uint256 bits, bytes32 digest) internal override {
        uint256 id = index + 1;
        seedOf[id] = digest;
        bitsOf[id] = uint8(bits);
        _mint(to, id);
    }

    function tokenURI(uint256 id) public view override returns (string memory) {
        _requireOwned(id);
        // Hash'in başı zorluk yüzünden hep sıfırdır; özellikler son baytlardan alınır
        uint256 v = uint256(seedOf[id]);
        uint256 hue = (v & 0xffff) % 360;
        uint256 blocks = ((v >> 16) & 0xff) % 3 + 1;
        string memory json = string.concat(
            '{"name":"BlockHound #', id.toString(),
            '","description":"Proof-of-work mint. The art is derived on chain from the hash its miner found.",',
            '"image":"data:image/svg+xml;base64,', Base64.encode(bytes(_svg(id, v, hue, blocks))),
            '","attributes":[{"trait_type":"Difficulty bits","value":', uint256(bitsOf[id]).toString(),
            '},{"trait_type":"Epoch","value":', ((id - 1) / epochSize).toString(),
            '},{"trait_type":"Hue","value":', hue.toString(),
            '},{"trait_type":"Blocks","value":', blocks.toString(), "}]}"
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function _svg(uint256 id, uint256 v, uint256 hue, uint256 blocks) internal pure returns (string memory) {
        string memory h = hue.toString();
        string memory ear = string.concat("hsl(", ((hue + 40 + ((v >> 24) & 0xff) % 80) % 360).toString(), ",18%,62%)");
        string memory blk = string.concat("hsl(", h, ",85%,58%)");
        string memory out = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">',
            '<rect width="64" height="64" fill="hsl(', h, ',28%,9%)"/>',
            '<path d="M10 56L10 33L15 22L27 16L37 19L44 25L57 35L58 41L52 43L41 40L34 44L28 48L25 56Z" fill="#eee"/>',
            '<path d="M17 22L28 19L30 33L25 44L19 41L16 31Z" fill="', ear, '"/>',
            '<rect x="35" y="24" width="4" height="4" fill="#111"/><rect x="54" y="37" width="4" height="4" fill="#111"/>',
            '<rect x="49" y="47" width="9" height="9" rx="1.5" fill="', blk, '"/>'
        );
        if (blocks > 1) out = string.concat(out, '<rect x="42" y="51" width="5" height="5" rx="1" opacity=".55" fill="', blk, '"/>');
        if (blocks > 2) out = string.concat(out, '<rect x="37" y="54" width="3" height="3" rx=".5" opacity=".3" fill="', blk, '"/>');
        return string.concat(
            out,
            '<text x="5" y="9" font-family="monospace" font-size="4.5" fill="#a4a19b">#', id.toString(), "</text></svg>"
        );
    }
}
