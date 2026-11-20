# Changelog

Wszystkie istotne zmiany w aplikacji. Format oparty na [Keep a Changelog](https://keepachangelog.com/pl/1.1.0/), wersje według [Semantic Versioning](https://semver.org/lang/pl/).

## 1.1.0 - 2026-11-20

### Dodane

- **Rezygnacja z przydzielonych podpunktów.** W turze 2 student może zrezygnować z części lub wszystkich podpunktów przydzielonych mu w turze 1. Zwolnione podpunkty stają się wolne i inni mogą się do nich dopisać przed drugim przydziałem.
- **Zmiana hasła.** Nowa pozycja „Zmień hasło” w menu konta. Wymaga podania obecnego hasła. Po zmianie sesje na innych urządzeniach są kończone.
- **Usuwanie konta.** Nowa pozycja „Usuń konto” w menu konta. Wymaga hasła i potwierdzenia. Usuwa konto, profil, członkostwo w grupie, zgłoszenia i plusy, a przydzielone podpunkty stają się wolne. Konta administratora grupy nie można usunąć z aplikacji.
- **„Zapomniałeś hasła?” na ekranie logowania.** Wyświetla informację, że nowe hasło ustawia administrator grupy (aplikacja nie wysyła wiadomości e-mail).

## 1.0.0 2026-11-15

Pierwsze wydanie.

- Rejestracja i logowanie adresem `@student.agh.edu.pl`, uzupełnianie profilu, dołączanie do grupy kodem zaproszenia.
- Podanie liczby posiadanych plusów przy rejestracji.
- Panel administratora: zestawy zadań z ręczną numeracją zadań i podpunktów, zajęcia z wyborem zestawów, terminem zapisów i statusami.
- Zapisy w dwóch turach i przydział podpunktów przez funkcję `assign`.
- Plusy: wpisywanie przez studenta (+1 za dowolny podpunkt) oraz wpisy i korekty administratora z historią.
- Wdrożenie na GitHub Pages przez GitHub Actions.
