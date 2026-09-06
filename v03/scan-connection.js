export const CURRENT_SCAN_CONNECTION = '';

function routeError(code, message, cause = null) {
    const error = new Error(message, cause ? { cause } : undefined);
    error.code = code;
    return error;
}

function canonicalValue(value) {
    if (Array.isArray(value)) return value.map(canonicalValue);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalValue(value[key])]));
}

export function scanProfileSignature(profile) {
    return JSON.stringify(canonicalValue(profile || {}));
}

function serviceFromContext(context) {
    const service = context?.ConnectionManagerRequestService;
    return service && typeof service === 'function' ? service : (service && typeof service === 'object' ? service : null);
}

export function scanConnectionProfileOptions(getContext) {
    let context;
    try { context = getContext?.(); }
    catch (error) {
        return { available: false, profiles: [], error: String(error?.message || error || 'Connection Profile service is unavailable.') };
    }
    const service = serviceFromContext(context);
    if (!service || typeof service.getSupportedProfiles !== 'function') {
        return { available: false, profiles: [], error: 'This SillyTavern build does not expose Connection Profile request services.' };
    }
    try {
        const profiles = service.getSupportedProfiles()
            .map(profile => ({ id: String(profile?.id || ''), name: String(profile?.name || profile?.id || '').trim() }))
            .filter(profile => profile.id && profile.name)
            .sort((left, right) => left.name.localeCompare(right.name));
        return { available: true, profiles, error: '' };
    } catch (error) {
        return { available: false, profiles: [], error: String(error?.message || error || 'Connection Profiles are unavailable.') };
    }
}

export function resolveScanGenerationRoute(getContext, selectedProfileId = '') {
    const profileId = String(selectedProfileId || '').trim();
    if (!profileId) return { kind: 'current' };
    let context;
    try { context = getContext?.(); }
    catch (error) { throw routeError('NPC_STATE_SCAN_PROFILE_UNAVAILABLE', 'NPC scan connection profile service is unavailable.', error); }
    const service = serviceFromContext(context);
    if (!service || typeof service.getSupportedProfiles !== 'function' || typeof service.getProfile !== 'function' || typeof service.sendRequest !== 'function') {
        throw routeError('NPC_STATE_SCAN_PROFILE_UNAVAILABLE', 'NPC scan connection profile service is unavailable in this SillyTavern build. Choose Current connection or enable Connection Profiles.');
    }
    let supported;
    try { supported = service.getSupportedProfiles(); }
    catch (error) { throw routeError('NPC_STATE_SCAN_PROFILE_UNAVAILABLE', 'Connection Profiles are unavailable. Choose Current connection or enable Connection Profiles.', error); }
    const profile = supported.find(item => String(item?.id || '') === profileId);
    if (!profile) {
        throw routeError('NPC_STATE_SCAN_PROFILE_MISSING', `NPC scan connection profile ${profileId} is missing, deleted, disabled, or unsupported. NPC State will not fall back to the main connection.`);
    }
    try { service.validateProfile?.(profile); }
    catch (error) { throw routeError('NPC_STATE_SCAN_PROFILE_UNSUPPORTED', `NPC scan connection profile ${profile.name || profileId} is not supported. NPC State will not fall back to the main connection.`, error); }
    return {
        kind: 'profile',
        profileId,
        profileName: String(profile.name || profileId),
        profileSignature: scanProfileSignature(profile),
    };
}

function profileStillMatches(service, route) {
    const profile = service.getProfile(route.profileId);
    service.validateProfile?.(profile);
    if (scanProfileSignature(profile) !== route.profileSignature) {
        throw routeError('NPC_STATE_SCAN_PROFILE_CHANGED', `NPC scan connection profile ${route.profileName || route.profileId} changed while this scan was in progress. The operation was cancelled before retry/commit so one scan cannot mix connection configurations.`);
    }
    return profile;
}

export async function generateWithScanRoute({ getContext, route = { kind: 'current' }, systemPrompt, prompt, responseLength, signal = null }) {
    const context = getContext?.();
    if (route?.kind !== 'profile') {
        if (typeof context?.generateRaw !== 'function') throw routeError('NPC_STATE_MAIN_GENERATION_UNAVAILABLE', 'SillyTavern generateRaw() is unavailable.');
        return context.generateRaw({
            systemPrompt,
            prompt,
            quietToLoud: false,
            instructOverride: true,
            responseLength,
            signal,
        });
    }

    const service = serviceFromContext(context);
    if (!service || typeof service.sendRequest !== 'function' || typeof service.getProfile !== 'function') {
        throw routeError('NPC_STATE_SCAN_PROFILE_UNAVAILABLE', 'NPC scan connection profile service became unavailable. NPC State will not fall back to the main connection.');
    }
    try {
        profileStillMatches(service, route);
        const response = await service.sendRequest(
            route.profileId,
            [
                { role: 'system', content: String(systemPrompt || '') },
                { role: 'user', content: String(prompt || '') },
            ],
            responseLength,
            {
                stream: false,
                signal,
                extractData: true,
                includePreset: true,
                includeInstruct: true,
                instructSettings: {},
            },
        );
        if (!response || typeof response.content !== 'string') {
            throw routeError('NPC_STATE_SCAN_PROFILE_RESPONSE', `NPC scan connection profile ${route.profileName || route.profileId} returned no generated answer text.`);
        }
        return response.content;
    } catch (error) {
        if (String(error?.code || '').startsWith('NPC_STATE_')) throw error;
        if (signal?.aborted || error?.name === 'AbortError') {
            throw routeError('NPC_STATE_SCAN_CANCELLED', `NPC scan request through ${route.profileName || route.profileId} was cancelled.`, error);
        }
        throw routeError('NPC_STATE_SCAN_PROFILE_REQUEST_FAILED', `NPC scan request through ${route.profileName || route.profileId} failed. NPC State will not fall back to the main connection.`, error);
    }
}
