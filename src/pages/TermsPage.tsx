export default function TermsPage() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-12 text-foreground">
      <h1 className="text-3xl font-bold mb-2">Conditions d'utilisation</h1>
      <p className="text-sm text-muted-foreground mb-8">Dernière mise à jour : 1er juin 2025</p>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">1. Acceptation des conditions</h2>
        <p className="leading-relaxed">
          En utilisant l'application On Mange Quoi ? (ci-après « l'Application »), accessible via{" "}
          <a href="https://onmangequoi.net" className="text-primary underline">onmangequoi.net</a>,
          vous acceptez les présentes conditions d'utilisation. Si vous n'acceptez pas ces conditions,
          veuillez ne pas utiliser l'Application.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">2. Description du service</h2>
        <p className="leading-relaxed">
          On Mange Quoi ? est une application web qui utilise l'intelligence artificielle pour analyser
          vos ingrédients (via photo ou saisie manuelle) et vous proposer des recettes adaptées.
          Le service est gratuit et accessible sans inscription.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">3. Utilisation acceptable</h2>
        <p className="leading-relaxed mb-2">Vous vous engagez à :</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Utiliser l'Application uniquement à des fins personnelles et légales</li>
          <li>Ne pas tenter d'accéder aux systèmes ou données d'autres utilisateurs</li>
          <li>Ne pas surcharger intentionnellement les serveurs de l'Application</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">4. Propriété intellectuelle</h2>
        <p className="leading-relaxed">
          Le contenu de l'Application (textes, images, logo, recettes générées) est la propriété
          exclusive de l'éditeur. Toute reproduction ou redistribution sans autorisation est interdite.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">5. Limitation de responsabilité</h2>
        <p className="leading-relaxed">
          L'Application est fournie « en l'état ». Les recettes générées par l'IA sont indicatives —
          vérifiez toujours les ingrédients, allergènes et temps de cuisson. L'éditeur ne saurait
          être tenu responsable de tout dommage lié à l'utilisation des recettes proposées.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">6. Modifications</h2>
        <p className="leading-relaxed">
          L'éditeur se réserve le droit de modifier ces conditions à tout moment. La date de
          dernière mise à jour sera indiquée en haut de cette page.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">7. Contact</h2>
        <p className="leading-relaxed">
          Pour toute question relative aux présentes conditions, contactez-nous via{" "}
          <a href="https://onmangequoi.net" className="text-primary underline">onmangequoi.net</a>.
        </p>
      </section>
    </div>
  );
}
