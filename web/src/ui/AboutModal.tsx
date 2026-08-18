import { RANK_VISIBLE_WITHIN } from "../game/bands";
import { HINT_UNLOCK_AT } from "../game/hints";
import type { Manifest } from "../game/types";
import Modal from "./Modal";

type Props = {
  manifest: Manifest | null;
  onClose: () => void;
};

/**
 * How the game works.
 *
 * A dialog rather than a panel in the rail: it is read once, and it was taking
 * up permanent space in a column that has to hold the words played and the
 * input.
 */
export default function AboutModal({ manifest, onClose }: Props) {
  return (
    <Modal titleId="about-title" onClose={onClose} className="modal-about">
      <h2 id="about-title" className="modal-title modal-title-plain">
        How this works
      </h2>

      <h3>Closeness, not spelling</h3>
      <p>
        Every word in the game has been turned into a list of numbers by a
        model trained on a very large amount of text. Words used in similar
        contexts end up with similar numbers. The score next to your guess is
        how closely its numbers line up with the secret word&rsquo;s.
      </p>
      <p>
        So <em>hot</em> scores well against <em>cold</em> &mdash; opposites
        still keep the same company &mdash; while <em>cot</em> scores nothing
        at all.
      </p>

      <h3>Rank</h3>
      <p>
        Raw scores are hard to read, so each guess is also placed against every
        other word in the game. Inside the closest{" "}
        {RANK_VISIBLE_WITHIN.toLocaleString()} you are shown the exact
        position; beyond that you get the band only, because the difference
        between 40,000th and 41,000th is not information.
      </p>

      <h3>The map</h3>
      <p>
        The secret word sits at the centre. Every other word is placed by how
        close it is &mdash; distance from the middle &mdash; and by what it
        means &mdash; the direction. Words that mean similar things point the
        same way, so guesses that line up along one arm are the same idea
        restated. If that arm is not reaching the middle, try a different
        direction rather than a synonym.
      </p>

      <h3>Hints</h3>
      <p>
        After {HINT_UNLOCK_AT} guesses you can ask for a hint. It reveals a
        word half as far from the answer as your best guess so far. Hints are
        marked on the board and counted in your result.
      </p>

      <h3>Where the words come from</h3>
      <p>
        {manifest?.source.vectors ?? "Pre-trained word vectors"}, used under
        the {manifest?.source.licence ?? "their published licence"}. Answers
        are hand-picked. The word list has had slurs and explicit terms removed
        rather than left in with a warning.
      </p>
      <p className="fineprint">
        Nothing you type leaves your device. Your progress is stored in this
        browser only &mdash; there is no account and no analytics.
      </p>

      <div className="modal-actions">
        <button type="button" className="button-primary" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
