import type { Page } from "@playwright/test";

export async function stripeElementsFixture(page: Page) {
  // Stripe is stubbed at its script boundary. No card details or external charges.
  await page.route("https://js.stripe.com/**", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.Stripe=function(){return {initCheckoutElementsSdk:function(options){
        window.__checkoutOptions=options;
        if(options.defaultValues && ('email' in options.defaultValues || 'phoneNumber' in options.defaultValues))throw new Error('Cannot update customer contact details');
        return {
          loadActions:async function(){return {type:'success',actions:{getSession:function(){return {billingAddress:null};},confirm:async function(args){
            window.__confirmArguments=args;
            if('email' in args || 'phoneNumber' in args)throw new Error('Cannot update customer contact details');
            window.__confirmCalls=(window.__confirmCalls||0)+1;
            if(window.__holdConfirmation)await new Promise(resolve=>{window.__resolveConfirmation=resolve;});
            if(window.__declinePayment){window.__declinePayment=false;return {type:'error',error:{message:'Cardul a fost refuzat.'}};}
            window.__paymentCompleted=true;
            return {type:'success',session:{status:{type:'complete'}}};
          }}};},
          createPaymentElement:function(options){
            window.__paymentOptions=options;
            let root;const handlers={};
            return {
              update:function(options){if('email' in options.defaultValues.billingDetails || 'phone' in options.defaultValues.billingDetails)throw new Error('Cannot update customer contact details');window.__paymentDefaults=options;},
              on:function(event,handler){handlers[event]=handler;},
              mount:function(node){root=node;node.innerHTML='<label>Numărul cardului<input aria-label="Numărul cardului" placeholder="1234 1234 1234 1234" /></label><label>Expirare<input aria-label="Expirare" placeholder="LL / AA" /></label><label>CVC<input aria-label="CVC" placeholder="CVC" /></label>';if(handlers.change)handlers.change({value:{billingDetails:{address:{country:'RO',postalCode:'105400'}}}});if(handlers.ready)handlers.ready();},
              destroy:function(){if(root)root.innerHTML='';window.__elementDestroyed=true;}
            };
          }
        };
      }};};`,
    }),
  );
}
