// ==UserScript==
// @name         ChatGPT Project Pin Jump
// @namespace    chatgpt-project-pin-jump
// @version      1.0.0
// @description  Makes ChatGPT Project Sources jump to the exact original message they were saved from.
// @author       Community proof of concept
// @match        https://chatgpt.com/*
// @grant        none
// @run-at       document-start
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    let searchRun = 0;
    let lastUrl = location.href;

    const sleep = (ms) =>
        new Promise((resolve) => setTimeout(resolve, ms));

    function getMessageId() {
        return new URLSearchParams(location.search).get('messageId');
    }

    function findTarget(id) {
        if (!id) return null;

        return document.querySelector(
            `[data-message-id="${CSS.escape(id)}"]`
        );
    }

    /*
     * Find the actual conversation scrollbar by starting at a rendered
     * message and walking upward until we reach a scrollable ancestor.
     */
    function findChatScroller() {
        const message = document.querySelector('[data-message-id]');

        if (!message) return null;

        let element = message.parentElement;

        while (element) {
            const style = getComputedStyle(element);

            const isScrollable =
                (style.overflowY === 'auto' ||
                 style.overflowY === 'scroll') &&
                element.scrollHeight > element.clientHeight + 200;

            if (isScrollable) {
                return element;
            }

            element = element.parentElement;
        }

        return null;
    }

    function highlight(target) {
        const oldOutline = target.style.outline;
        const oldOffset = target.style.outlineOffset;
        const oldTransition = target.style.transition;

        target.style.transition = 'outline 0.2s ease';
        target.style.outline = '3px solid #f0a020';
        target.style.outlineOffset = '6px';

        setTimeout(() => {
            target.style.outline = oldOutline;
            target.style.outlineOffset = oldOffset;
            target.style.transition = oldTransition;
        }, 2200);
    }

    async function landOnTarget(target, scroller, run) {
        /*
         * ChatGPT may still be adjusting the conversation while content is
         * mounting, so briefly reassert the exact target position.
         */
        for (let i = 0; i < 12; i++) {
            if (run !== searchRun) return;

            target.scrollIntoView({
                behavior: 'auto',
                block: 'start'
            });

            scroller.scrollBy({
                top: -60,
                behavior: 'auto'
            });

            await sleep(120);
        }

        highlight(target);
    }

    async function huntForMessage() {
        const run = ++searchRun;
        const id = getMessageId();

        if (!id) return;

        // The target may already be mounted.
        let target = findTarget(id);

        if (target) {
            const scroller = findChatScroller();

            if (scroller) {
                await landOnTarget(target, scroller, run);
            }

            return;
        }

        // Wait for ChatGPT to render enough of the conversation to identify
        // the real scroll container.
        let scroller = null;

        for (let i = 0; i < 60; i++) {
            if (run !== searchRun) return;

            scroller = findChatScroller();

            if (scroller) break;

            await sleep(200);
        }

        if (!scroller) {
            console.warn('[Project Pin Jump] Conversation scrollbar not found.');
            return;
        }

        /*
         * Sweep upward through the currently loaded conversation.
         * Moving by less than a viewport keeps each section passing through
         * the rendered window so virtualized messages have a chance to mount.
         */
        let position = scroller.scrollTop;

        const step = Math.max(
            400,
            Math.floor(scroller.clientHeight * 0.75)
        );

        while (position > 0) {
            if (run !== searchRun) return;

            target = findTarget(id);

            if (target) {
                await landOnTarget(target, scroller, run);
                return;
            }

            position = Math.max(0, position - step);

            scroller.scrollTo({
                top: position,
                behavior: 'auto'
            });

            await sleep(120);

            target = findTarget(id);

            if (target) {
                await landOnTarget(target, scroller, run);
                return;
            }
        }

        // Final check at the beginning of the loaded conversation.
        await sleep(400);

        target = findTarget(id);

        if (target) {
            await landOnTarget(target, scroller, run);
        } else {
            console.warn(
                '[Project Pin Jump] Reached the beginning without finding message:',
                id
            );
        }
    }

    function checkNavigation() {
        if (location.href === lastUrl) return;

        lastUrl = location.href;

        // Cancel any search associated with the previous URL.
        searchRun++;

        if (getMessageId()) {
            setTimeout(huntForMessage, 600);
        }
    }

    /*
     * ChatGPT uses client-side navigation. Watching the URL is deliberately
     * simple and avoids depending on a specific framework or router.
     */
    setInterval(checkNavigation, 250);

    // Also support Project Source URLs opened directly in a new page/tab.
    window.addEventListener('DOMContentLoaded', () => {
        if (getMessageId()) {
            setTimeout(huntForMessage, 700);
        }
    });
})();
