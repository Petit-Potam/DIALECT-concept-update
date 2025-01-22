class TabList extends HTMLUListElement {
  constructor() {
    super();

    this.controls.forEach((button) => button.addEventListener('click', this.handleButtonClick.bind(this)));
  }

  get controls() {
    return this._controls = this._controls || Array.from(this.querySelectorAll('[aria-controls]'));
  }

  handleButtonClick(event) {
    event.preventDefault();

    this.controls.forEach((button) => {
      button.setAttribute('aria-expanded', 'false');

      const panel = document.getElementById(button.getAttribute('aria-controls'));
      panel?.removeAttribute('open');
    });

    const target = event.currentTarget;
    target.setAttribute('aria-expanded', 'true');

    const panel = document.getElementById(target.getAttribute('aria-controls'));
    panel?.setAttribute('open', '');
  }

  reset() {
    const firstControl = this.controls[0];
    firstControl.dispatchEvent(new Event('click'));
  }
}
customElements.define('tab-list', TabList, { extends: 'ul' });

class CartDrawer extends DrawerElement {
  constructor() {
    super();
  }

  get shouldAppendToBody() {
    return false;
  }

  get recentlyViewed() {
    return this.querySelector('recently-viewed');
  }

  get tabList() {
    return this.querySelector('[is="tab-list"]');
  }

  connectedCallback() {
    super.connectedCallback();

    document.addEventListener('cart:bundled-sections', this.onPrepareBundledSections.bind(this));
    if (this.recentlyViewed) {
      this.recentlyViewed.addEventListener('is-empty', this.onRecentlyViewedEmpty.bind(this));
    }
  }

  onPrepareBundledSections(event) {
    event.detail.sections.push(theme.utils.sectionId(this));
  }

  onRecentlyViewedEmpty() {
    this.recentlyViewed.innerHTML = `
    <div class="drawer__scrollable relative flex justify-center items-start grow shrink text-center">
      <div class="drawer__empty grid gap-5 md:gap-8">
        <h2 class="drawer__empty-text font-bold leading-none tracking-tight">${theme.strings.recentlyViewedEmpty}</h2>
      </div>
    </div>
    `;
  }

  show(focusElement = null, animate = true) {
    super.show(focusElement, animate);

    if (this.tabList) {
      this.tabList.reset();

      if (this.open) {
        theme.a11y.trapFocus(this, this.focusElement);
      }
    }
  }
}
customElements.define('cart-drawer', CartDrawer);

class CartQuantity extends QuantitySelector {
  constructor() {
    super();
  }

  quantityUpdateUnsubscriber = undefined;

  connectedCallback() {
    super.connectedCallback();
    this.quantityUpdateUnsubscriber = theme.pubsub.subscribe(theme.pubsub.PUB_SUB_EVENTS.quantityUpdate, this.validateQtyRules.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    
    if (this.quantityUpdateUnsubscriber) {
      this.quantityUpdateUnsubscriber();
    }
  }

  validateQtyRules() {
    const value = parseInt(this.input.value);
    if (this.input.min) {
      const buttonMinus = this.querySelector('[name="minus"]');
      if (buttonMinus) {
        buttonMinus.disabled = parseInt(value) <= parseInt(this.input.min);
      }
    }
    if (this.input.max) {
      const buttonPlus = this.querySelector('[name="plus"]');
      if (buttonPlus) {
        buttonPlus.disabled = parseInt(value) >= parseInt(this.input.max);
      }
    }
  }
}
customElements.define('cart-quantity', CartQuantity);

class CartRemoveButton extends HTMLAnchorElement {
  constructor() {
    super();

    this.addEventListener('click', (event) => {
      event.preventDefault();

      const cartItems = this.closest('cart-items');
      cartItems.updateQuantity(this.dataset.index, 0);
    });
  }
}
customElements.define('cart-remove-button', CartRemoveButton, { extends: 'a' });

class CartItems extends HTMLElement {
  constructor() {
    super();

    this.addEventListener('change', theme.utils.debounce(this.onChange.bind(this), 300));
    this.cartUpdateUnsubscriber = theme.pubsub.subscribe(theme.pubsub.PUB_SUB_EVENTS.cartUpdate, this.onCartUpdate.bind(this));
    this.editLinkActivationUnsubscriber = theme.pubsub.subscribe(theme.pubsub.PUB_SUB_EVENTS.cartUpdate, this.editLinkActivation.bind(this));
    this.editLinkActivation();
  }

  cartUpdateUnsubscriber = undefined;

  disconnectedCallback() {
    if (this.cartUpdateUnsubscriber) {
      this.cartUpdateUnsubscriber();
    }
    if (this.editLinkActivationUnsubscriber) {
      this.editLinkActivationUnsubscriber();
    }    
  }

  onChange(event) {
    this.updateQuantity(event.target.dataset.index, event.target.value, document.activeElement.getAttribute('name'), event.target);
  }

  onCartUpdate(event) {
    if (event.cart.errors) {
      this.onCartError(event.cart.errors, event.target);
      return;
    }

    const sectionId = theme.utils.sectionId(this);
    const sectionToRender = new DOMParser().parseFromString(event.cart.sections[sectionId], 'text/html');

    const miniCart = document.querySelector(`#MiniCart-${sectionId}`);
    if (miniCart) {
      const updatedElement = sectionToRender.querySelector(`#MiniCart-${sectionId}`);
      if (updatedElement) {
        miniCart.innerHTML = updatedElement.innerHTML;
      }
    }

    const mainCart = document.querySelector(`#MainCart-${sectionId}`);
    if (mainCart) {
      const updatedElement = sectionToRender.querySelector(`#MainCart-${sectionId}`);
      if (updatedElement) {
        mainCart.innerHTML = updatedElement.innerHTML;
      }
      else {
        mainCart.closest('.cart').classList.add('is-empty');
        mainCart.remove();
      }
    }

    const lineItem = document.getElementById(`CartItem-${event.line}`) || document.getElementById(`CartDrawer-Item-${event.line}`);
    if (lineItem && lineItem.querySelector(`[name="${event.name}"]`)) {
      theme.a11y.trapFocus(mainCart || miniCart, lineItem.querySelector(`[name="${event.name}"]`));
    }
    else if (event.cart.item_count === 0) {
      miniCart
        ? theme.a11y.trapFocus(miniCart, miniCart.querySelector('a'))
        : theme.a11y.trapFocus(document.querySelector('.empty-state'), document.querySelector('.empty-state__link'));
    }
    else {
      miniCart
        ? theme.a11y.trapFocus(miniCart, miniCart.querySelector('.horizontal-product__title'))
        : theme.a11y.trapFocus(mainCart, mainCart.querySelector('.cart__item-title'));
    }

    document.dispatchEvent(new CustomEvent('cart:updated', {
      detail: {
        cart: event.cart
      }
    }));
  }

  onCartError(errors, target) {
    if (target) {
      this.updateQuantity(target.dataset.index, target.defaultValue, document.activeElement.getAttribute('name'), target);
    }
    else {
      window.location.href = theme.routes.cart_url;
    }

    alert(errors);
  }

  updateQuantity(line, quantity, name, target) {
    this.enableLoading(line);

    let sectionsToBundle = [];
    document.documentElement.dispatchEvent(new CustomEvent('cart:bundled-sections', { bubbles: true, detail: { sections: sectionsToBundle } }));

    const body = JSON.stringify({
      line,
      quantity,
      sections: sectionsToBundle
    });

    fetch(`${theme.routes.cart_change_url}`, { ...theme.utils.fetchConfig(), ...{ body } })
      .then((response) => response.json())
      .then((parsedState) => {
        theme.pubsub.publish(theme.pubsub.PUB_SUB_EVENTS.cartUpdate, { cart: parsedState, target, line, name });
      })
      .catch((error) => {
        console.log(error);
      });
  }

  enableLoading(line) {
    const sectionId = theme.utils.sectionId(this);
    const loader = document.getElementById(`Loader-${sectionId}-${line}`);
    if (loader) loader.hidden = false;
  }

  editLinkActivation() {
    this.querySelectorAll("[data-bundle-id-to-remove]").forEach((el) => {
      el.addEventListener("click", (e) => {
        window.sessionStorage.setItem("bundleIdToRemove", e.target.closest("[data-bundle-id-to-remove]").getAttribute("data-bundle-id-to-remove"));
      })
    })
  }
}
customElements.define('cart-items', CartItems);

class CartNote extends HTMLElement {
  constructor() {
    super();

    this.addEventListener('change', theme.utils.debounce(this.onChange.bind(this), 300));
  }

  onChange(event) {
    const body = JSON.stringify({ note: event.target.value });
    fetch(`${theme.routes.cart_update_url}`, { ...theme.utils.fetchConfig(), ...{ body } });
  }
}
customElements.define('cart-note', CartNote);

class MainCart extends HTMLElement {
  constructor() {
    super();

    document.addEventListener('cart:bundled-sections', this.onPrepareBundledSections.bind(this));
  }

  onPrepareBundledSections(event) {
    event.detail.sections.push(theme.utils.sectionId(this));
  }
}
customElements.define('main-cart', MainCart);

class CountryProvince extends HTMLElement {
  constructor() {
    super();

    this.provinceElement = this.querySelector('[name="address[province]"]');
    this.countryElement = this.querySelector('[name="address[country]"]');
    this.countryElement.addEventListener('change', this.handleCountryChange.bind(this));

    if (this.getAttribute('country') !== '') {
      this.countryElement.selectedIndex = Math.max(0, Array.from(this.countryElement.options).findIndex((option) => option.textContent === this.dataset.country));
      this.countryElement.dispatchEvent(new Event('change'));
    }
    else {
      this.handleCountryChange();
    }
  }

  handleCountryChange() {
    const option = this.countryElement.options[this.countryElement.selectedIndex], provinces = JSON.parse(option.dataset.provinces);
    this.provinceElement.parentElement.hidden = provinces.length === 0;

    if (provinces.length === 0) {
      return;
    }

    this.provinceElement.innerHTML = '';

    provinces.forEach((data) => {
      const selected = data[1] === this.dataset.province;
      this.provinceElement.options.add(new Option(data[1], data[0], selected, selected));
    });
  }
}
customElements.define('country-province', CountryProvince);

class ShippingCalculator extends HTMLFormElement {
  constructor() {
    super();

    this.submitButton = this.querySelector('[type="submit"]');
    this.resultsElement = this.lastElementChild;

    this.submitButton.addEventListener('click', this.handleFormSubmit.bind(this));
  }

  handleFormSubmit(event) {
    event.preventDefault();

    const zip = this.querySelector('[name="address[zip]"]').value,
      country = this.querySelector('[name="address[country]"]').value,
      province = this.querySelector('[name="address[province]"]').value;

    this.submitButton.setAttribute('aria-busy', 'true');

    const body = JSON.stringify({
      shipping_address: { zip, country, province }
    });
    let sectionUrl = `${theme.routes.cart_url}/shipping_rates.json`;

    // remove double `/` in case shop might have /en or language in URL
    sectionUrl = sectionUrl.replace('//', '/');

    fetch(sectionUrl, { ...theme.utils.fetchConfig('javascript'), ...{ body } })
      .then((response) => response.json())
      .then((parsedState) => {
        if (parsedState.shipping_rates) {
          this.formatShippingRates(parsedState.shipping_rates);
        }
        else {
          this.formatError(parsedState);
        }
      })
      .catch((e) => {
        console.error(e);
      })
      .finally(() => {
        this.resultsElement.hidden = false;
        this.submitButton.removeAttribute('aria-busy');
      });

  }

  formatError(errors) {
    const shippingRatesList = Object.keys(errors).map((errorKey) => {
      return `<li>${errors[errorKey]}</li>`;
    });
    this.resultsElement.innerHTML = `
      <div class="alert alert--error grid gap-2 text-sm leading-tight">
        <p>${theme.shippingCalculatorStrings.error}</p>
        <ul class="list-disc grid gap-2" role="list">${shippingRatesList.join('')}</ul>
      </div>
    `;
  }

  formatShippingRates(shippingRates) {
    const shippingRatesList = shippingRates.map(({ presentment_name, currency, price }) => {
      return `<li>${presentment_name}: ${currency} ${price}</li>`;
    });
    this.resultsElement.innerHTML = `
      <div class="alert alert--${shippingRates.length === 0 ? 'error' : 'success'} grid gap-2 text-sm leading-tight">
        <p>${shippingRates.length === 0 ? theme.shippingCalculatorStrings.notFound : shippingRates.length === 1 ? theme.shippingCalculatorStrings.oneResult : theme.shippingCalculatorStrings.multipleResults}</p>
        ${shippingRatesList === '' ? '' : `<ul class="list-disc grid gap-2" role="list">${shippingRatesList.join('')}</ul>`}
      </div>
    `;

  }
}
customElements.define('shipping-calculator', ShippingCalculator, { extends: 'form' });
