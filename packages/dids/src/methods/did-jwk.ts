import type {
  Jwk,
  CryptoApi,
  KeyIdentifier,
  KmsExportKeyParams,
  KmsImportKeyParams,
  KeyImporterExporter,
  InferKeyGeneratorAlgorithm,
} from '@web5/crypto';

import { Convert } from '@web5/common';
import { LocalKeyManager } from '@web5/crypto';

import type { BearerDid, DidCreateOptions, DidCreateVerificationMethod, DidMetadata, PortableDid } from './did-method.js';
import type { DidDocument, DidResolutionOptions, DidResolutionResult, DidVerificationMethod } from '../types/did-core.js';

import { Did } from '../did.js';
import { DidMethod } from './did-method.js';
import { DidError, DidErrorCode } from '../did-error.js';
import { EMPTY_DID_RESOLUTION_RESULT } from '../resolver/did-resolver.js';

/**
 * Defines the set of options available when creating a new Decentralized Identifier (DID) with the
 * 'did:jwk' method.
 *
 * Either the `algorithm` or `verificationMethods` option can be specified, but not both.
 * - A new key will be generated using the algorithm identifier specified in either the `algorithm`
 *   property or the `verificationMethods` object's `algorithm` property.
 * - If `verificationMethods` is given, it must contain exactly one entry since DID JWK only
 *   supports a single verification method.
 * - If neither is given, the default is to generate a new Ed25519 key.
 *
 * @example
 * ```ts
  * // By default, when no options are given, a new Ed25519 key will be generated.
 * const did = await DidJwk.create();
 *
 * // The algorithm to use for key generation can be specified as a top-level option.
 * const did = await DidJwk.create({
 *   options: { algorithm = 'ES256K' }
 * });
 *
 * // Or, alternatively as a property of the verification method.
 * const did = await DidJwk.create({
 *   options: {
 *     verificationMethods: [{ algorithm = 'ES256K' }]
 *   }
 * });
 * ```
 */
export interface DidJwkCreateOptions<TKms> extends DidCreateOptions<TKms> {
  /**
   * Optionally specify the algorithm to be used for key generation.
   */
  algorithm?: TKms extends CryptoApi
    ? InferKeyGeneratorAlgorithm<TKms>
    : InferKeyGeneratorAlgorithm<LocalKeyManager>;

  /**
   * Alternatively, specify the algorithm to be used for key generation of the single verification
   * method in the DID Document.
   */
  verificationMethods?: [DidCreateVerificationMethod<TKms>];
}

/**
 * The `DidJwk` class provides an implementation of the `did:jwk` DID method.
 *
 * Features:
 * - DID Creation: Create new `did:jwk` DIDs.
 * - DID Key Management: Instantiate a DID object from an existing verification method key set or
 *                       or a key in a Key Management System (KMS). If supported by the KMS, a DID's
 *                       key can be exported to a portable DID format.
 * - DID Resolution: Resolve a `did:jwk` to its corresponding DID Document.
 * - Signature Operations: Sign and verify messages using keys associated with a DID.
 *
 * @remarks
 * The `did:jwk` DID method uses a single JSON Web Key (JWK) to generate a DID and does not rely
 * on any external system such as a blockchain or centralized database. This characteristic makes
 * it suitable for use cases where a assertions about a DID Subject can be self-verifiable by
 * third parties.
 *
 * The DID URI is formed by Base64URL-encoding the JWK and prefixing with `did:jwk:`. The DID
 * Document of a `did:jwk` DID contains a single verification method, which is the JWK used
 * to generate the DID. The verification method is identified by the key ID `#0`.
 *
 * @see {@link https://github.com/quartzjer/did-jwk/blob/main/spec.md | DID JWK Specification}
 *
 * @example
 * ```ts
 * // DID Creation
 * const did = await DidJwk.create();
 *
 * // DID Creation with a KMS
 * const keyManager = new LocalKeyManager();
 * const did = await DidJwk.create({ keyManager });
 *
 * // DID Resolution
 * const resolutionResult = await DidJwk.resolve({ did: did.uri });
 *
 * // Signature Operations
 * const signer = await did.getSigner();
 * const signature = await signer.sign({ data: new TextEncoder().encode('Message') });
 * const isValid = await signer.verify({ data: new TextEncoder().encode('Message'), signature });
 *
 * // Key Management
 *
 * // Instantiate a DID object from an existing key in a KMS
 * const did = await DidJwk.fromKeyManager({
 *  didUri: 'did:jwk:eyJrIjoiT0tQIiwidCI6IkV1c2UyNTYifQ',
 *  keyManager
 * });
 *
 * // Instantiate a DID object from an existing verification method key
 * const did = await DidJwk.fromKeys({
 *   verificationMethods: [{
 *     publicKeyJwk: {
 *       kty: 'OKP',
 *       crv: 'Ed25519',
 *       x: 'cHs7YMLQ3gCWjkacMURBsnEJBcEsvlsE5DfnsfTNDP4'
 *     },
 *     privateKeyJwk: {
 *       kty: 'OKP',
 *       crv: 'Ed25519',
 *       x: 'cHs7YMLQ3gCWjkacMURBsnEJBcEsvlsE5DfnsfTNDP4',
 *       d: 'bdcGE4KzEaekOwoa-ee3gAm1a991WvNj_Eq3WKyqTnE'
 *     }
 *   }]
 * });
 *
 * // Convert a DID object to a portable format
 * const portableDid = await DidJwk.toKeys({ did });
 *
 * // Reconstruct a DID object from a portable format
 * const did = await DidJwk.fromKeys(portableDid);
 * ```
 */
export class DidJwk extends DidMethod {

  /**
   * Name of the DID method, as defined in the DID JWK specification.
   */
  public static methodName = 'jwk';

  /**
   * Creates a new DID using the `did:jwk` method formed from a newly generated key.
   *
   * @remarks
   * The DID URI is formed by Base64URL-encoding the JWK and prefixing with `did:jwk:`.
   *
   * Notes:
   * - If no `options` are given, by default a new Ed25519 key will be generated.
   * - The `algorithm` and `verificationMethods` options are mutually exclusive. If both are given,
   *   an error will be thrown.
   *
   * @example
   * ```ts
   * // DID Creation
   * const did = await DidJwk.create();
   *
   * // DID Creation with a KMS
   * const keyManager = new LocalKeyManager();
   * const did = await DidJwk.create({ keyManager });
   * ```
   *
   * @param params - The parameters for the create operation.
   * @param params.keyManager - Optionally specify a Key Management System (KMS) used to generate
   *                            keys and sign data.
   * @param params.options - Optional parameters that can be specified when creating a new DID.
   * @returns A Promise resolving to a {@link BearerDid} object representing the new DID.
   */
  public static async create<TKms extends CryptoApi | undefined = undefined>({
    keyManager = new LocalKeyManager(),
    options = {}
  }: {
    keyManager?: TKms;
    options?: DidJwkCreateOptions<TKms>;
  } = {}): Promise<BearerDid> {
    if (options.algorithm && options.verificationMethods) {
      throw new Error(`The 'algorithm' and 'verificationMethods' options are mutually exclusive`);
    }

    // Default to Ed25519 key generation if an algorithm is not given.
    const algorithm = options.algorithm ?? options.verificationMethods?.[0]?.algorithm ?? 'Ed25519';

    // Generate a new key using the specified `algorithm`.
    const keyUri = await keyManager.generateKey({ algorithm });
    const publicKey = await keyManager.getPublicKey({ keyUri });

    // Create the DID object from the generated key material, including DID document, metadata,
    // signer convenience function, and URI.
    const did = await DidJwk.fromPublicKey({ keyManager, publicKey });

    return did;
  }

  /**
   * Instantiates a {@link BearerDid} object for the `did:jwk` method from a given
   * {@link PortableDid}.
   *
   * This method allows for the creation of a `BearerDid` object using pre-existing key material,
   * encapsulated within the `verificationMethods` array of the `PortableDid`. This is particularly
   * useful when the key material is already available and you want to construct a `BearerDid`
   * object based on these keys, instead of generating new keys.
   *
   * @remarks
   * The `verificationMethods` array must contain exactly one key since the `did:jwk` method only
   * supports a single verification method.
   *
   * The key material (both public and private keys) should be provided in JWK format. The method
   * handles the inclusion of these keys in the DID Document and sets up the necessary verification
   * relationships.
   *
   * @example
   * ```ts
   * // Example with an existing key in JWK format.
   * const verificationMethods = [{
   *   publicKeyJwk: { // public key in JWK format },
   *   privateKeyJwk: { // private key in JWK format }
   * }];
   * const did = await DidJwk.fromKeys({ verificationMethods });
   * ```
   *
   * @param params - The parameters for the `fromKeys` operation.
   * @param params.keyManager - Optionally specify an external Key Management System (KMS) used to
   *                            generate keys and sign data. If not given, a new
   *                            {@link @web5/crypto#LocalKeyManager} instance will be created and used.
   * @returns A Promise resolving to a `BearerDid` object representing the DID formed from the provided keys.
   * @throws An error if the `verificationMethods` array does not contain exactly one entry.
   */
  public static async fromKeys({
    keyManager = new LocalKeyManager(),
    verificationMethods
  }: {
    keyManager?: CryptoApi & KeyImporterExporter<KmsImportKeyParams, KeyIdentifier, KmsExportKeyParams>;
    options?: unknown;
  } & PortableDid): Promise<BearerDid> {
    if (!verificationMethods || verificationMethods.length !== 1) {
      throw new Error(`Only one verification method can be specified but ${verificationMethods?.length ?? 0} were given`);
    }

    if (!(verificationMethods[0].privateKeyJwk && verificationMethods[0].publicKeyJwk)) {
      throw new Error(`Verification method does not contain a public and private key in JWK format`);
    }

    // Store the private key in the key manager.
    await keyManager.importKey({ key: verificationMethods[0].privateKeyJwk });

    // Create the DID object from the given key material, including DID document, metadata,
    // signer convenience function, and URI.
    const did = await DidJwk.fromPublicKey({
      keyManager,
      publicKey: verificationMethods[0].publicKeyJwk
    });

    return did;
  }

  /**
   * Given the W3C DID Document of a `did:jwk` DID, return the verification method that will be used
   * for signing messages and credentials. If given, the `methodId` parameter is used to select the
   * verification method. If not given, the first verification method in the DID Document is used.
   *
   * Note that for DID JWK, only one verification method can exist so specifying `methodId` could be
   * considered redundant or unnecessary. The option is provided for consistency with other DID
   * method implementations.
   *
   * @param params - The parameters for the `getSigningMethod` operation.
   * @param params.didDocument - DID Document to get the verification method from.
   * @param params.methodId - ID of the verification method to use for signing.
   * @returns Verification method to use for signing.
   */
  public static async getSigningMethod({ didDocument, methodId = '#0' }: {
    didDocument: DidDocument;
    methodId?: string;
  }): Promise<DidVerificationMethod | undefined> {
    // Verify the DID method is supported.
    const parsedDid = Did.parse(didDocument.id);
    if (parsedDid && parsedDid.method !== this.methodName) {
      throw new DidError(DidErrorCode.MethodNotSupported, `Method not supported: ${parsedDid.method}`);
    }

    // Attempt to find the verification method in the DID Document.
    const verificationMethod = didDocument.verificationMethod?.find(vm => vm.id.endsWith(methodId));

    return verificationMethod;
  }

  /**
   * Resolves a `did:jwk` identifier to a DID Document.
   *
   * @param didUri - The DID to be resolved.
   * @param _options - Optional parameters for resolving the DID. Unused by this DID method.
   * @returns A Promise resolving to a {@link DidResolutionResult} object representing the result of the resolution.
   */
  public static async resolve(didUri: string, _options?: DidResolutionOptions): Promise<DidResolutionResult> {
    // Attempt to parse the DID URI.
    const parsedDid = Did.parse(didUri);

    // Attempt to decode the Base64URL-encoded JWK.
    let publicKey: Jwk | undefined;
    try {
      publicKey = Convert.base64Url(parsedDid!.id).toObject() as Jwk;
    } catch { /* Consume the error so that a DID resolution error can be returned later. */ }

    // If parsing or decoding failed, the DID is invalid.
    if (!parsedDid || !publicKey) {
      return {
        ...EMPTY_DID_RESOLUTION_RESULT,
        didResolutionMetadata: { error: 'invalidDid' }
      };
    }

    // If the DID method is not "jwk", return an error.
    if (parsedDid.method !== DidJwk.methodName) {
      return {
        ...EMPTY_DID_RESOLUTION_RESULT,
        didResolutionMetadata: { error: 'methodNotSupported' }
      };
    }

    const didDocument: DidDocument = {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/suites/jws-2020/v1'
      ],
      id: parsedDid.uri
    };

    const keyUri = `${didDocument.id}#0`;

    // Set the Verification Method property.
    didDocument.verificationMethod = [{
      id           : keyUri,
      type         : 'JsonWebKey2020',
      controller   : didDocument.id,
      publicKeyJwk : publicKey
    }];

    // Set the Verification Relationship properties.
    didDocument.authentication = [keyUri];
    didDocument.assertionMethod = [keyUri];
    didDocument.capabilityInvocation = [keyUri];
    didDocument.capabilityDelegation = [keyUri];
    didDocument.keyAgreement = [keyUri];

    // If the JWK contains a `use` property with the value "sig" then the `keyAgreement` property
    // is not included in the DID Document. If the `use` value is "enc" then only the `keyAgreement`
    // property is included in the DID Document.
    switch (publicKey.use) {
      case 'sig': {
        delete didDocument.keyAgreement;
        break;
      }

      case 'enc': {
        delete didDocument.authentication;
        delete didDocument.assertionMethod;
        delete didDocument.capabilityInvocation;
        delete didDocument.capabilityDelegation;
        break;
      }
    }

    return {
      ...EMPTY_DID_RESOLUTION_RESULT,
      didDocument,
    };
  }

  /**
   * Instantiates a {@link BearerDid} object for the DID JWK method from a given public key.
   *
   * @param params - The parameters for the operation.
   * @param params.keyManager - A Key Management System (KMS) instance for managing keys and
   *                            performing cryptographic operations.
   * @param params.publicKey - The public key of the DID in JWK format.
   * @returns A Promise resolving to a `BearerDid` object representing the DID formed from the provided public key.
   */
  private static async fromPublicKey({ keyManager, publicKey }: {
    keyManager: CryptoApi;
    publicKey: Jwk;
  }): Promise<BearerDid> {
    // Serialize the public key JWK to a UTF-8 string and encode to Base64URL format.
    const base64UrlEncoded = Convert.object(publicKey).toBase64Url();

    // Attach the prefix `did:jwk` to form the complete DID URI.
    const didUri = `did:${DidJwk.methodName}:${base64UrlEncoded}`;

    // Expand the DID URI string to a DID document.
    const didResolutionResult = await DidJwk.resolve(didUri);
    const didDocument = didResolutionResult.didDocument as DidDocument;

    // DID Metadata is initially empty for this DID method.
    const metadata: DidMetadata = {};

    // Define a function that returns a signer for the DID.
    const getSigner = async (params?: { keyUri?: string }) => await DidJwk.getSigner({
      didDocument,
      keyManager,
      keyUri: params?.keyUri
    });

    return { didDocument, getSigner, keyManager, metadata, uri: didUri };
  }
}