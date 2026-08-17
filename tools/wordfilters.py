"""Word lists used to shape the vocabulary and the answer set.

Kept separate from the pipeline so non-engineers can edit them.

BLOCKED is applied to the *whole* vocabulary, not just the answers: anything in
here is unguessable, never appears in a hint, and is never plotted. That is a
deliberately stricter stance than Semantle/Pimantle, which keep slurs guessable
and warn the player instead. A consumer brand cannot take that bet.

This list is a starting point, not a finished one. Before any public launch,
replace it with a maintained multi-language profanity/slur dataset and have it
reviewed by someone whose job that is.
"""

# Slurs and sexual content. Deliberately not exhaustive - see module docstring.
BLOCKED_EXACT = {
    # racial / ethnic / religious slurs
    "nigger", "niggers", "nigga", "niggas", "chink", "chinks", "gook", "gooks",
    "spic", "spics", "wetback", "wetbacks", "kike", "kikes", "yid", "yids",
    "paki", "pakis", "raghead", "ragheads", "towelhead", "towelheads",
    "coon", "coons", "darkie", "darkies", "negro", "negroes", "negress",
    "gypsy", "gypsies", "gyppo", "half-caste", "mulatto", "mulattos",
    "squaw", "squaws", "redskin", "redskins", "injun", "injuns",
    "jap", "japs", "nip", "wop", "wops", "dago", "dagos", "polack", "polacks",
    "kraut", "krauts", "gringo", "beaner", "beaners", "abo", "abos",
    # sexuality / gender slurs
    "faggot", "faggots", "fag", "fags", "dyke", "dykes", "tranny", "trannies",
    "shemale", "shemales", "queer", "queers", "poof", "poofs", "poofter",
    "homo", "homos", "ladyboy", "ladyboys",
    # disability slurs
    "retard", "retards", "retarded", "spastic", "spastics", "spaz", "spazz",
    "mongoloid", "cripple", "cripples", "imbecile", "moron", "morons",
    # sexual / explicit
    "cunt", "cunts", "twat", "twats", "cock", "cocks", "dick", "dicks",
    "penis", "penises", "vagina", "vaginas", "pussy", "pussies", "clit",
    "cum", "jizz", "wank", "wanker", "wankers", "blowjob", "blowjobs",
    "handjob", "rimjob", "creampie", "bukkake", "gangbang", "felching",
    "anal", "anus", "buttplug", "dildo", "dildos", "fleshlight",
    "porn", "porno", "pornography", "hentai", "milf", "nympho",
    "whore", "whores", "slut", "sluts", "hooker", "hookers", "prostitute",
    "fuck", "fucks", "fucked", "fucking", "fucker", "fuckers", "motherfucker",
    "shit", "shits", "shitting", "bullshit", "bitch", "bitches", "bastard",
    "arsehole", "asshole", "assholes", "dickhead", "prick", "pricks",
    "titties", "boobs", "boob", "tits", "tit", "nipple", "nipples",
    "masturbate", "masturbation", "orgasm", "orgasms", "ejaculate",
    "erection", "erections", "horny", "incest", "pedophile", "paedophile",
    "pedophilia", "paedophilia", "bestiality", "necrophilia", "rape",
    "rapes", "raped", "raping", "rapist", "rapists", "molest", "molested",
    "molester", "molestation", "sodomy", "sodomize", "sodomise",
    # self-harm / graphic violence, kept out of a family-brand word game
    "suicide", "suicides", "suicidal", "selfharm", "anorexia", "bulimia",
    "lynching", "lynched", "genocide", "holocaust", "massacre", "massacres",
    "beheading", "beheaded", "torture", "tortured", "mutilate", "mutilated",
    "decapitate", "decapitated", "disembowel", "castrate", "castrated",
}

# Substrings that make a token unguessable wherever they appear. Catches the
# long tail of inflections without enumerating every one.
BLOCKED_SUBSTRINGS = (
    "nigg", "faggot", "fuck", "cunt", "rape", "rapist", "porn", "incest",
    "pedophil", "paedophil", "bestial", "molest",
)

# Function words. Fine to guess, terrible as an answer - "however" is not a
# puzzle. Only ever used to filter the answer set.
FUNCTION_WORDS = {
    "the", "and", "for", "are", "but", "not", "you", "all", "any", "can",
    "had", "her", "was", "one", "our", "out", "day", "get", "has", "him",
    "his", "how", "man", "new", "now", "old", "see", "two", "way", "who",
    "boy", "did", "its", "let", "put", "say", "she", "too", "use", "that",
    "with", "have", "this", "will", "your", "from", "they", "know", "want",
    "been", "good", "much", "some", "time", "very", "when", "come", "here",
    "just", "like", "long", "make", "many", "over", "such", "take", "than",
    "them", "well", "were", "what", "would", "there", "their", "which",
    "about", "could", "other", "these", "those", "after", "first", "never",
    "where", "while", "should", "because", "before", "between", "through",
    "during", "however", "although", "therefore", "moreover", "whereas",
    "nevertheless", "furthermore", "meanwhile", "otherwise", "whether",
    "including", "according", "regarding", "concerning", "despite", "toward",
    "towards", "upon", "into", "onto", "within", "without", "against",
    "among", "amongst", "around", "behind", "below", "beneath", "beside",
    "besides", "beyond", "under", "above", "across", "along", "since",
    "until", "unless", "though", "whom", "whose", "each", "every", "both",
    "either", "neither", "another", "same", "also", "only", "even", "still",
    "already", "always", "often", "sometimes", "usually", "perhaps", "maybe",
    "really", "actually", "probably", "certainly", "quite", "rather",
    "almost", "enough", "least", "less", "more", "most", "much", "several",
    "somewhat", "thus", "hence", "indeed", "instead", "likewise", "namely",
    "accordingly", "consequently", "additionally", "specifically",
    "particularly", "generally", "essentially", "basically", "obviously",
    "clearly", "simply", "merely", "solely", "purely", "entirely",
    "completely", "totally", "absolutely", "definitely", "exactly",
    "approximately", "roughly", "nearly", "barely", "hardly", "scarcely",
}
