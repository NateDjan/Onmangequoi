export default function PrivacyPage() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-12 text-foreground">
      <h1 className="text-3xl font-bold mb-2">Politique de confidentialité</h1>
      <p className="text-sm text-muted-foreground mb-8">Dernière mise à jour : 1er juin 2025</p>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">1. Introduction</h2>
        <p className="leading-relaxed">
          La présente politique de confidentialité décrit comment l'application On Mange Quoi ?
          (accessible via{" "}
          <a href="https://onmangequoi.net" className="text-primary underline">onmangequoi.net</a>)
          collecte, utilise et protège vos données personnelles.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">2. Données collectées</h2>
        <p className="leading-relaxed mb-2">Nous collectons uniquement :</p>
        <ul className="list-disc pl-6 space-y-1">
          <li><strong>Photos de frigo</strong> : transmises temporairement à l'IA pour analyse des ingrédients, non stockées de façon permanente</li>
          <li><strong>Ingrédients saisis</strong> : utilisés uniquement pour générer des recettes</li>
          <li><strong>Données de compte</strong> (si inscription) : adresse e-mail et mot de passe chiffré</li>
          <li><strong>Données analytiques anonymes</strong> : via Google Analytics (pages visitées, durée de session) sans identification personnelle</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">3. Utilisation des données</h2>
        <p className="leading-relaxed mb-2">Vos données sont utilisées pour :</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Générer des suggestions de recettes personnalisées</li>
          <li>Améliorer les performances de l'Application</li>
          <li>Assurer la sécurité du service</li>
        </ul>
        <p className="leading-relaxed mt-2">
          Nous ne vendons ni ne partageons vos données personnelles avec des tiers à des fins commerciales.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">4. Cookies</h2>
        <p className="leading-relaxed">
          L'Application utilise des cookies techniques nécessaires au fonctionnement du service
          (session utilisateur) et des cookies analytiques (Google Analytics). Vous pouvez désactiver
          les cookies analytiques depuis les paramètres de votre navigateur.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">5. Conservation des données</h2>
        <p className="leading-relaxed">
          Les photos transmises pour analyse sont supprimées après traitement. Les données de compte
          sont conservées tant que votre compte est actif. Vous pouvez demander la suppression de
          votre compte à tout moment.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">6. Vos droits (RGPD)</h2>
        <p className="leading-relaxed mb-2">Conformément au RGPD, vous disposez des droits suivants :</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Droit d'accès à vos données</li>
          <li>Droit de rectification</li>
          <li>Droit à l'effacement (« droit à l'oubli »)</li>
          <li>Droit à la portabilité des données</li>
          <li>Droit d'opposition au traitement</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">7. Sécurité</h2>
        <p className="leading-relaxed">
          Nous mettons en œuvre des mesures techniques et organisationnelles appropriées pour protéger
          vos données contre tout accès non autorisé, perte ou divulgation.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">8. Contact</h2>
        <p className="leading-relaxed">
          Pour exercer vos droits ou pour toute question relative à cette politique, contactez-nous
          via{" "}
          <a href="https://onmangequoi.net" className="text-primary underline">onmangequoi.net</a>.
        </p>
      </section>
    </div>
  );
}
