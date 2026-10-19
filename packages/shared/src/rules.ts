/**
 * Community rules. The bot publishes the exact same text that the website
 * renders, in English and Albanian, so the two can never drift apart.
 */
export interface RuleSection {
  id: string;
  title: { en: string; sq: string };
  items: { en: string; sq: string }[];
}

export const RULES_VERSION = '2026.1';
export const RULES_UPDATED_AT = '2026-09-01T00:00:00.000Z';

export const RULES: RuleSection[] = [
  {
    id: 'conduct',
    title: { en: 'Respect and conduct', sq: 'Respekti dhe sjellja' },
    items: [
      {
        en: 'Treat every player and staff member with respect. Insults, harassment, threats and discrimination are not tolerated.',
        sq: 'Trajto çdo lojtar dhe anëtar të stafit me respekt. Fyerjet, ngacmimi, kërcënimet dhe diskriminimi nuk tolerohen.',
      },
      {
        en: 'Do not evade a punishment with another account. Evasion extends the original punishment indefinitely.',
        sq: 'Mos e shmang një dënim me një llogari tjetër. Shmangia e zgjat dënimin origjinal pa afat.',
      },
      {
        en: 'Impersonating staff, players or the Dardania | Elite brand is forbidden.',
        sq: 'Impersonimi i stafit, i lojtarëve ose i markës Dardania | Elite është i ndaluar.',
      },
      {
        en: 'Staff decisions are made on evidence. Disagree with a decision through the appeal channel, not by disrupting the servers.',
        sq: 'Vendimet e stafit merren mbi bazë provash. Kundërshto një vendim përmes kanalit të apelimit, jo duke prishur rendin në server.',
      },
    ],
  },
  {
    id: 'cheating',
    title: { en: 'Cheating and third-party software', sq: 'Mashtrimi dhe softueri i palës së tretë' },
    items: [
      {
        en: 'Any cheat, aimbot, wallhack, triggerbot, macro or external assistance is a permanent ban on first confirmed offence.',
        sq: 'Çdo cheat, aimbot, wallhack, triggerbot, makro ose ndihmë e jashtme dënohet me ban të përhershëm në rastin e parë të konfirmuar.',
      },
      {
        en: 'Scripts that automate movement or shooting, including bhop and recoil scripts, are treated as cheating.',
        sq: 'Skriptet që automatizojnë lëvizjen ose qitjen, përfshirë bhop dhe skriptet e recoil-it, trajtohen si mashtrim.',
      },
      {
        en: 'Deliberately playing with a known cheater to gain an advantage (boosting) is punishable.',
        sq: 'Loja e qëllimshme me një mashtrues të njohur për të përfituar (boosting) është e dënueshme.',
      },
      {
        en: 'Sharing or selling cheats inside Dardania | Elite spaces results in an immediate ban.',
        sq: 'Shpërndarja ose shitja e cheats brenda hapësirave të Dardania | Elite rezulton në ban të menjëhershëm.',
      },
    ],
  },
  {
    id: 'exploits',
    title: { en: 'Exploits, bugs and match integrity', sq: 'Shfrytëzimi i gabimeve dhe integriteti i ndeshjes' },
    items: [
      {
        en: 'Abusing map bugs, out-of-bounds positions, or economy exploits is forbidden. Report bugs to staff instead.',
        sq: 'Shfrytëzimi i gabimeve të hartave, pozicioneve jashtë kufijve ose shfrytëzimeve ekonomike është i ndaluar. Raporto gabimet te stafi.',
      },
      {
        en: 'Do not intentionally ruin a match for your own team (team-killing, blocking, griefing).',
        sq: 'Mos e prish qëllimisht një ndeshje për ekipin tënd (vrasje bashkëlojtarësh, bllokim, griefing).',
      },
      {
        en: 'Smurfing to bypass a competitive restriction or a punishment is not allowed.',
        sq: 'Smurfimi për të shmangur një kufizim konkurrues ose një dënim nuk lejohet.',
      },
      {
        en: 'Manipulating match results or betting on community matches with inside knowledge is prohibited.',
        sq: 'Manipulimi i rezultateve ose baste në ndeshjet e komunitetit me informacion të brendshëm është i ndaluar.',
      },
    ],
  },
  {
    id: 'communication',
    title: { en: 'Communication and content', sq: 'Komunikimi dhe përmbajtja' },
    items: [
      {
        en: 'No hate speech, slurs, sexual content involving minors, or glorification of violence in any channel.',
        sq: 'Nuk lejohet gjuhë urrejtjeje, fyerje, përmbajtje seksuale me të mitur ose lavdërim i dhunës në asnjë kanal.',
      },
      {
        en: 'Advertising other communities, services or cheat sellers is not allowed without written staff approval.',
        sq: 'Reklamimi i komuniteteve, shërbimeve ose shitësve të cheats nuk lejohet pa miratim me shkrim nga stafi.',
      },
      {
        en: 'Do not share personal data of other people (doxxing), including addresses, phone numbers or private photos.',
        sq: 'Mos ndaj të dhëna personale të të tjerëve (doxxing), përfshirë adresa, numra telefoni ose foto private.',
      },
      {
        en: 'Keep voice channels civil. Earrape, soundboards and constant background noise lead to removal from voice.',
        sq: 'Mbajini kanalet zanore të qeta. Zhurma ekstreme, soundboard-et dhe zhurma e vazhdueshme çojnë në largim nga kanali zanor.',
      },
    ],
  },
  {
    id: 'accounts',
    title: { en: 'Accounts, trading and scams', sq: 'Llogaritë, tregtimi dhe mashtrimet' },
    items: [
      {
        en: 'You are responsible for everything done from your Discord and Steam accounts.',
        sq: 'Ju jeni përgjegjës për çdo veprim të kryer nga llogaritë tuaja të Discord-it dhe Steam-it.',
      },
      {
        en: 'Steam item trading happens at your own risk. Dardania | Elite staff never act as middlemen.',
        sq: 'Tregtimi i artikujve në Steam bëhet me rrezikun tuaj. Stafi i Dardania | Elite nuk vepron kurrë si ndërmjetës.',
      },
      {
        en: 'Any known scam attempt results in a permanent ban and is recorded in the moderation history.',
        sq: 'Çdo tentativë e njohur mashtrimi rezulton në ban të përhershëm dhe regjistrohet në historikun e moderimit.',
      },
      {
        en: 'Never share your Steam API key, Discord token or account credentials with anyone claiming to be staff.',
        sq: 'Kurrë mos ndani çelësin Steam API, tokenin e Discord-it ose kredencialet e llogarisë me askënd që pretendon se është staf.',
      },
    ],
  },
  {
    id: 'pc-checks',
    title: { en: 'PC checks', sq: 'Kontrolli i PC-së' },
    items: [
      {
        en: 'A PC check is only requested when there is concrete suspicion, and it is always handled through the official PC-check case system.',
        sq: 'Kontrolli i PC-së kërkohet vetëm kur ekziston dyshim konkret dhe gjithmonë trajtohet përmes sistemit zyrtar të rasteve të PC-check.',
      },
      {
        en: 'Staff must explain the reason and stay inside the agreed scope. You may ask for the check to be reviewed by an Owner.',
        sq: 'Stafi duhet të shpjegojë arsyen dhe të qëndrojë brenda fushëveprimit të rënë dakord. Mund të kërkoni që kontrollin ta rishikojë një Pronar.',
      },
      {
        en: 'Refusing to cooperate with a properly announced PC check can lead to a temporary ban until the review is complete.',
        sq: 'Refuzimi i bashkëpunimit me një kontroll PC të shpallur siç duhet mund të çojë në ban të përkohshëm derisa rishikimi të përfundojë.',
      },
      {
        en: 'PC-check notes and evidence are handled as confidential staff records.',
        sq: 'Shënimet dhe provat e PC-check trajtohen si të dhëna konfidenciale të stafit.',
      },
    ],
  },
  {
    id: 'moderation',
    title: { en: 'Moderation and appeals', sq: 'Moderimi dhe apelimet' },
    items: [
      {
        en: 'Every punishment has a case reference. Keep it — it is the fastest way to have a decision reviewed.',
        sq: 'Çdo dënim ka një referencë rasti. Ruajeni — është mënyra më e shpejtë për të rishikuar një vendim.',
      },
      {
        en: 'Appeals are reviewed by the moderation leadership, never by the moderator who issued the punishment alone.',
        sq: 'Apelimet rishikohen nga udhëheqja e moderimit, kurrë vetëm nga moderatori që dha dënimin.',
      },
      {
        en: 'Unbanning restores your access but never deletes the original ban record. The history remains accurate.',
        sq: 'Heqja e ban-it rikthen aksesin tuaj, por nuk fshin kurrë regjistrin origjinal. Historiku mbetet i saktë.',
      },
      {
        en: 'Providing false evidence or harassing staff during an appeal is a separate punishable offence.',
        sq: 'Dhënia e provave të rreme ose ngacmimi i stafit gjatë një apelimi është shkelje më vete e dënueshme.',
      },
    ],
  },
  {
    id: 'privacy',
    title: { en: 'Privacy and data', sq: 'Privatësia dhe të dhënat' },
    items: [
      {
        en: 'Dardania | Elite stores moderation records (including Discord IDs and the Steam name observed at the time) to keep its history accurate.',
        sq: 'Dardania | Elite ruan regjistrat e moderimit (përfshirë ID-të e Discord-it dhe emrin e Steam-it të vëzhguar në atë moment) për të mbajtur historikun e saktë.',
      },
      {
        en: 'Steam display names are snapshots, not identifiers. Changing a Steam name never changes past records.',
        sq: 'Emrat e shfaqur në Steam janë fotografi të momentit, jo identifikues. Ndryshimi i emrit në Steam nuk ndryshon regjistrat e kaluar.',
      },
      {
        en: 'Only the Owner and Co-Owner allowlist can access the private dashboard and full moderation history.',
        sq: 'Vetëm lista e Pronarit dhe Bashkëpronarit mund të aksesojë panelin privat dhe historikun e plotë të moderimit.',
      },
      {
        en: 'Request removal or correction of your data through the official support channel. Verified corrections are logged in the audit trail.',
        sq: 'Kërkoni fshirjen ose korrigjimin e të dhënave tuaja përmes kanalit zyrtar të mbështetjes. Korrigjimet e verifikuara regjistrohen në gjurmën e auditimit.',
      },
    ],
  },
];
