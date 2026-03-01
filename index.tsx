//// Plugin originally written for Equicord at 2026-02-16 by https://github.com/Bluscream, https://antigravity.google
// region Imports
import definePlugin from "@utils/types";
import { MediaEngineStore, FluxDispatcher } from "@webpack/common";
import { Logger } from "@utils/Logger";
import type { VoiceMode } from "@vencord/discord-types";
import { definePluginSettings } from "@api/Settings";
import { OptionType, makeRange } from "@utils/types";
// endregion Imports

import { pluginInfo } from "./info";
export { pluginInfo };

// region Variables
const logger = new Logger(pluginInfo.id, pluginInfo.color);
const INPUT_MODE_PTT: VoiceMode = "PUSH_TO_TALK";
const INPUT_MODE_VAD: VoiceMode = "VOICE_ACTIVITY";

const settings = definePluginSettings({
    showPttToggle: {
        type: OptionType.BOOLEAN,
        description: "Show Push to Talk toggle in Audio Device Context Menu",
        default: true
    },
    showKrispToggle: {
        type: OptionType.BOOLEAN,
        description: "Show Krisp toggle in Audio Device Context Menu",
        default: true
    },
    syncAutoThreshold: {
        type: OptionType.BOOLEAN,
        description: "Toggle automatic voice detection when toggling Krisp",
        default: true
    },
    krispOffThreshold: {
        type: OptionType.SLIDER,
        description: "Manual voice detection threshold when Krisp is OFF",
        default: -100,
        markers: makeRange(-100, 0, 10),
        stickToMarkers: false
    },
    debug: {
        type: OptionType.BOOLEAN,
        description: "Enable debug logging",
        default: false
    },
    cachedThreshold: {
        type: OptionType.NUMBER,
        description: "Cached manual voice detection threshold",
        default: -75,
        hidden: true
    }
});
// endregion Variables

// region Utils
function setVoiceModeOptions(options: { autoThreshold?: boolean; threshold?: number; }) {
    if (settings.store.debug) console.log("[pttToggle] setVoiceModeOptions called", options);
    try {
        const AudioActions = Vencord.Webpack.findByProps("setMode");
        const currentMode = (MediaEngineStore as any).getMode?.() || "VOICE_ACTIVITY";
        const currentOptions = (MediaEngineStore as any).getModeOptions?.() || {};

        if (AudioActions && AudioActions.setMode) {
            AudioActions.setMode(currentMode, { ...currentOptions, ...options }, "default", { analyticsLocations: [] });
        } else {
            FluxDispatcher.dispatch({
                type: "AUDIO_SET_MODE",
                context: "default",
                mode: currentMode,
                options: { ...currentOptions, ...options }
            });
        }
    } catch (e) {
        console.error("[pttToggle] Error in setVoiceModeOptions:", e);
    }
}

function setAutoThreshold(enabled: boolean) {
    setVoiceModeOptions({ autoThreshold: enabled });
}

function setThreshold(threshold: number) {
    setVoiceModeOptions({ threshold });
}

function getInputMode(): VoiceMode {
    try {
        const state = (MediaEngineStore as any).getState?.();
        return state?.settingsByContext?.default?.mode || INPUT_MODE_VAD;
    } catch {
        return INPUT_MODE_VAD;
    }
}

function toggleInputMode() {
    if (settings.store.debug) console.log("[pttToggle] toggleInputMode called");
    const currentMode = getInputMode();
    const newMode = currentMode === INPUT_MODE_PTT ? INPUT_MODE_VAD : INPUT_MODE_PTT;
    const state = (MediaEngineStore as any).getState?.() || {};

    if (settings.store.debug) console.log(`[pttToggle] Switching mode from ${currentMode} to ${newMode}`);
    FluxDispatcher.dispatch({
        type: "AUDIO_SET_MODE",
        context: "default",
        mode: newMode,
        options: state?.settingsByContext?.default?.modeOptions || {}
    });
}

function getKrispMode(): boolean {
    try {
        return (MediaEngineStore as any).getNoiseCancellation?.() ?? false;
    } catch {
        return false;
    }
}

function toggleKrispMode() {
    if (settings.store.debug) console.log("[pttToggle] toggleKrispMode called");
    const isKrisp = getKrispMode();
    const newKrispState = !isKrisp;
    if (settings.store.debug) console.log(`[pttToggle] Toggling Krisp: ${isKrisp} -> ${newKrispState}`);

    const location = { page: "User Settings", section: "Voice & Video" };

    try {
        const AudioActions = Vencord.Webpack.findByProps("setNoiseCancellation", "setNoiseSuppression");

        // 1. Sync Mode Options (Auto Sensitivity and Threshold)
        const currentOptions = (MediaEngineStore as any).getModeOptions?.() || {};
        const options: { autoThreshold?: boolean; threshold?: number; } = {};

        if (settings.store.syncAutoThreshold) {
            options.autoThreshold = newKrispState;
        }

        if (!newKrispState) {
            // Switching Krisp OFF -> Cache current and set to user defined level
            if (settings.store.debug) console.log(`[pttToggle] Caching current threshold: ${currentOptions.threshold}`);
            settings.store.cachedThreshold = currentOptions.threshold;
            options.threshold = settings.store.krispOffThreshold;
        } else {
            // Switching Krisp ON -> Restore cached threshold
            if (settings.store.debug) console.log(`[pttToggle] Restoring cached threshold: ${settings.store.cachedThreshold}`);
            options.threshold = settings.store.cachedThreshold;
        }

        setVoiceModeOptions(options);

        // 2. Sync Noise Cancellation/Suppression
        if (AudioActions) {
            if (newKrispState) {
                // Switching to Krisp
                if (settings.store.debug) console.log("[pttToggle] Calling native setNoiseCancellation(true)");
                AudioActions.setNoiseCancellation(true, location);
            } else {
                // Switching to None
                if (settings.store.debug) console.log("[pttToggle] Calling native setNoiseCancellation(false)");
                AudioActions.setNoiseCancellation(false, location);
                if (settings.store.debug) console.log("[pttToggle] Calling native setNoiseSuppression(false)");
                AudioActions.setNoiseSuppression(false, location);
            }
        } else {
            console.warn("[pttToggle] AudioActions not found! Falling back to raw dispatch.");
            if (newKrispState) {
                FluxDispatcher.dispatch({
                    type: "AUDIO_SET_NOISE_CANCELLATION",
                    enabled: true,
                    location
                });
                FluxDispatcher.dispatch({
                    type: "AUDIO_SET_NOISE_SUPPRESSION",
                    enabled: false,
                    location
                });
            } else {
                FluxDispatcher.dispatch({
                    type: "AUDIO_SET_NOISE_CANCELLATION",
                    enabled: false,
                    location
                });
                FluxDispatcher.dispatch({
                    type: "AUDIO_SET_NOISE_SUPPRESSION",
                    enabled: false,
                    location
                });
            }
        }
    } catch (e) {
        console.error("[pttToggle] Error toggling Krisp natively:", e);
    }
}

function createCheckboxIcon(isChecked: boolean): SVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'c1e9c47c23f12ca3-icon');
    svg.setAttribute('width', '20');
    svg.setAttribute('height', '20');
    svg.setAttribute('viewBox', '0 0 20 20');
    svg.setAttribute('fill', 'none');
    svg.style.color = 'var(--interactive-normal)';

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', '4');
    rect.setAttribute('y', '4');
    rect.setAttribute('width', '12');
    rect.setAttribute('height', '12');
    rect.setAttribute('rx', '2');
    rect.setAttribute('stroke', 'currentColor');
    rect.setAttribute('stroke-width', '1.5');
    rect.setAttribute('fill', isChecked ? 'var(--brand-500)' : 'transparent');
    svg.appendChild(rect);

    if (isChecked) {
        const checkmark = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        checkmark.setAttribute('d', 'M6.5 10L9 12.5L13.5 8');
        checkmark.setAttribute('stroke', '#FFFFFF');
        checkmark.setAttribute('stroke-width', '2');
        checkmark.setAttribute('stroke-linecap', 'round');
        checkmark.setAttribute('stroke-linejoin', 'round');
        checkmark.setAttribute('fill', 'none');
        svg.appendChild(checkmark);
    }

    return svg;
}
// endregion Utils

// region Definition
export default definePlugin({
    name: pluginInfo.name,
    description: pluginInfo.description,
    authors: pluginInfo.authors,
    settings,

    start() {
        const observer = new MutationObserver(() => {
            const menu = document.querySelector('#audio-device-context');
            if (!menu) return;
            const hasPttToggle = menu.querySelector('#audio-device-context-ptt-toggle');
            const hasKrispToggle = menu.querySelector('#audio-device-context-krisp-toggle');

            if (hasPttToggle && hasKrispToggle) return;

            const inputProfileItem = menu.querySelector('#audio-device-context-input-profiles');
            if (!inputProfileItem) return;

            let parent: HTMLElement | null = inputProfileItem.parentElement;
            while (parent && !parent.hasAttribute('role')) {
                parent = parent.parentElement;
            }
            if (!parent) parent = (menu.querySelector('[role="menu"] > div[class*="scroller"]') || menu) as HTMLElement;

            let inputProfileContainer = inputProfileItem.parentElement;
            while (inputProfileContainer && inputProfileContainer.tagName !== 'DIV') {
                inputProfileContainer = inputProfileContainer.parentElement;
            }
            if (!inputProfileContainer) return;

            const createToggle = (
                id: string,
                labelStr: string,
                getState: () => boolean,
                onToggle: () => void
            ) => {
                const toggleContainer = inputProfileContainer.cloneNode(true) as HTMLElement;
                toggleContainer.id = id;
                toggleContainer.setAttribute('role', 'menuitemcheckbox');
                toggleContainer.setAttribute('tabindex', '-1');
                toggleContainer.setAttribute('data-menu-item', 'true');

                // Remove any duplicate IDs from nested children to avoid ID conflicts
                const nestedItemsWithId = toggleContainer.querySelectorAll('[id^="audio-device-context"]');
                nestedItemsWithId.forEach(item => {
                    if (item.id !== id) {
                        item.removeAttribute('id');
                    }
                });

                const label = toggleContainer.querySelector('[class*="label"]') as HTMLElement;
                if (label) {
                    label.querySelector('[class*="subtext"]')?.remove();
                    const textNode = label.childNodes[0];
                    if (textNode?.nodeType === Node.TEXT_NODE) {
                        textNode.textContent = labelStr;
                    } else if (label.firstChild) {
                        label.firstChild.textContent = labelStr;
                    }
                }

                let iconContainer = toggleContainer.querySelector('[class*="iconContainer"]') as HTMLElement;

                if (!iconContainer) {
                    iconContainer = document.createElement('div');
                    iconContainer.className = 'c1e9c47c23f12ca3-iconContainer';
                    const labelContainer = toggleContainer.querySelector('[class*="labelContainer"]');
                    labelContainer?.parentElement?.appendChild(iconContainer);
                }

                iconContainer.innerHTML = '';
                iconContainer.style.display = 'flex';
                iconContainer.style.alignItems = 'center';
                iconContainer.style.justifyContent = 'center';

                let currentChecked = getState();
                const checkboxSvg = createCheckboxIcon(currentChecked);
                iconContainer.appendChild(checkboxSvg);
                toggleContainer.setAttribute('aria-checked', String(currentChecked));

                const updateCheckbox = () => {
                    const checked = getState();
                    if (checked === currentChecked) return;
                    currentChecked = checked;

                    toggleContainer.setAttribute('aria-checked', String(checked));
                    const rect = checkboxSvg.querySelector('rect');
                    const checkmark = checkboxSvg.querySelector('path[stroke="#FFFFFF"]');

                    if (rect) rect.setAttribute('fill', checked ? 'var(--brand-500)' : 'transparent');

                    if (checked && !checkmark) {
                        const newCheckmark = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                        newCheckmark.setAttribute('d', 'M6.5 10L9 12.5L13.5 8');
                        newCheckmark.setAttribute('stroke', '#FFFFFF');
                        newCheckmark.setAttribute('stroke-width', '2');
                        newCheckmark.setAttribute('stroke-linecap', 'round');
                        newCheckmark.setAttribute('stroke-linejoin', 'round');
                        newCheckmark.setAttribute('fill', 'none');
                        checkboxSvg.appendChild(newCheckmark);
                    } else if (!checked && checkmark) {
                        checkmark.remove();
                    }
                };

                const storeListener = () => {
                    updateCheckbox();
                };
                MediaEngineStore.addChangeListener(storeListener);

                toggleContainer.addEventListener('click', (e) => {
                    if (settings.store.debug) console.log(`[pttToggle] Toggle clicked: ${id}`);
                    e.preventDefault();
                    e.stopPropagation();
                    onToggle();

                    if (settings.store.debug) console.log(`[pttToggle] Dispatching Escape key to close menu for: ${id}`);
                    setTimeout(() => {
                        const escapeEvent = new KeyboardEvent('keydown', {
                            key: 'Escape',
                            code: 'Escape',
                            keyCode: 27,
                            bubbles: true,
                            cancelable: true
                        });
                        document.dispatchEvent(escapeEvent);
                    }, 50);
                });

                // Cleanup listener when the toggle is removed from DOM
                const cleanupObserver = new MutationObserver((mutations) => {
                    mutations.forEach((mutation) => {
                        mutation.removedNodes.forEach((removedNode) => {
                            if (removedNode === toggleContainer || removedNode.contains?.(toggleContainer)) {
                                MediaEngineStore.removeChangeListener(storeListener);
                                cleanupObserver.disconnect();
                            }
                        });
                    });
                });

                // Observe the menu wrapper to know when it closes
                cleanupObserver.observe(document.body, { childList: true, subtree: true });

                return toggleContainer;
            };

            const isPTT = getInputMode() === INPUT_MODE_PTT;
            const isKrisp = getKrispMode();

            if (!parent) return;

            const previousSibling = inputProfileContainer.nextSibling;

            if (settings.store.showKrispToggle && !hasKrispToggle) {
                const krispToggle = createToggle(
                    'audio-device-context-krisp-toggle',
                    'Krisp',
                    () => getKrispMode(),
                    toggleKrispMode
                );

                if (previousSibling) {
                    parent.insertBefore(krispToggle, previousSibling);
                } else {
                    parent.appendChild(krispToggle);
                }
            }

            if (settings.store.showPttToggle && !hasPttToggle) {
                const pttToggle = createToggle(
                    'audio-device-context-ptt-toggle',
                    'Push to Talk',
                    () => getInputMode() === INPUT_MODE_PTT,
                    toggleInputMode
                );

                if (previousSibling) {
                    parent.insertBefore(pttToggle, previousSibling);
                } else {
                    parent.appendChild(pttToggle);
                }
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
    },

    stop() {
        document.querySelector('#audio-device-context-ptt-toggle')?.remove();
        document.querySelector('#audio-device-context-krisp-toggle')?.remove();
    }
});
// endregion Definition
