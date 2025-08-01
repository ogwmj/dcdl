// js/discord-widget.js

const DISCORD_WIDGET_TEMPLATE = `
<style>
    /* Basic reset for the component */
    :host {
        all: initial;
    }
    
    #discord-link-button {
        position: fixed;
        /* The feedback widget is at 100px. This places the Discord icon above it. */
        /* 100px (feedback bottom) + 60px (feedback height) + 20px (margin) = 180px */
        bottom: 180px; 
        right: 20px;
        z-index: 8887; /* Just below the feedback widget's z-index */
        
        /* Style to match the feedback button */
        width: 60px;
        height: 60px;
        background-color: #5865F2; /* Discord Blurple */
        border-radius: 50%;
        display: flex;
        justify-content: center;
        align-items: center;
        box-shadow: 0 5px 15px rgba(88, 101, 242, 0.4);
        transition: transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out;
    }

    #discord-link-button:hover {
        transform: scale(1.1);
        box-shadow: 0 8px 25px rgba(88, 101, 242, 0.5);
    }

    #discord-icon {
        /* This ensures the image scales down to fit without being skewed */
        width: 60%;
        height: auto;
        object-fit: contain;
    }
</style>
<a id="discord-link-button" 
   href="https://discord.com/oauth2/authorize?client_id=1385296946142380104&permissions=17600776031232&integration_type=0&scope=bot+applications.commands" 
   target="_blank" 
   rel="noopener noreferrer" 
   aria-label="Join our Discord community">
    <img id="discord-icon" src="img/discord_white.png" alt="Discord Icon">
</a>
`;

class DiscordWidget extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.shadowRoot.innerHTML = DISCORD_WIDGET_TEMPLATE;
    }
}

customElements.define('discord-widget', DiscordWidget);