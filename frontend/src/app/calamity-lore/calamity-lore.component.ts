import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

type CalamityChapter = {
  marker: string;
  title: string;
  paragraphs: string[];
};

@Component({
  selector: 'app-calamity-lore',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './calamity-lore.component.html',
  styleUrl: './calamity-lore.component.css',
})
export class CalamityLoreComponent {
  readonly chapters: CalamityChapter[] = [
    {
      marker: 'I',
      title: 'Two Realms',
      paragraphs: [
        'The Light Kingdom and the Dark Kingdom once belonged to separate universes. Neither realm was inherently righteous or wicked; each possessed its own people, history, ambitions, and forms of magic.',
        'The Light Kingdom stood in the north. The Dark Kingdom stood in the south. Before the Calamity, no road, sea, or spell joined them.',
      ],
    },
    {
      marker: 'II',
      title: 'The Collision',
      paragraphs: [
        'The Calamity forced those universes together upon a single plane. Lands, skies, magical laws, and the directions themselves collided. The cause remains outside the surviving chronicle; only the consequences are known.',
        'No surviving calendar can say how long ago the Calamity occurred. Generations may have passed, or time itself may have been damaged in the collision; its true age remains unknown.',
        'Cut off from their native universes, both kingdoms immediately lost access to the magic that had sustained them. Their remaining enchanted reserves began to drain, and everything built upon that power faced extinction.',
        'East and west emerged reversed. What each realm had understood as the natural shape of its world could no longer be trusted, though north and south endured.',
      ],
    },
    {
      marker: 'III',
      title: 'The Royal Seals',
      paragraphs: [
        'Each King had trained beside his realm’s greatest warriors and studied under its finest wizards. Drawing on both disciplines, each ruler reached across the division between worlds and formed a connection to the home universe his kingdom had lost.',
        'Through that bond, the Kings began siphoning energy from their old universes. Before their kingdoms’ last stored power ran dry, each forged a Royal Seal to receive and distribute that distant magic.',
        'A Royal Seal is therefore the magical heart of an entire kingdom, but the King and his inter-universal bond are what feed it. Every surviving ward, weapon, healing art, transport enchantment, harvest working, civic protection, and engine of war draws power from the Seal.',
      ],
    },
    {
      marker: 'IV',
      title: 'The Price of Survival',
      paragraphs: [
        'The Kings must continually maintain the connection and channel its power into the Seals. They remain the strongest warriors and sorcerers of their realms, but that burden confines their choices and makes every threat against a King a threat against millions of lives.',
        'Check endangers the ruler, the connection, and the Seal together. Checkmate means no path remains that can preserve them. A conscious surrender carries the same terrible question: what becomes of a realm when its King can no longer reach the universe that once gave it magic?',
      ],
    },
    {
      marker: 'V',
      title: 'The Sundered Realities',
      paragraphs: [
        'The Calamity did not create the separate realities. The fracture came afterward, as each King siphoned magic from a different universe to sustain his Royal Seal.',
        'Those incompatible currents of power crossed within the same plane. Reality could not contain the strain and splintered into countless versions, each holding a different final clash between the Light Kingdom and Dark Kingdom.',
        'Every battle record reveals the final battle of one of those separate realities. Its warriors, relationships, wounds, deaths, promotions, victor, and ruined kingdom belong to that reality alone. Another record begins a different world whose last battle unfolds toward an entirely different fate.',
        'Within each reality, named soldiers advance, Archwizards fold space, Queens cross the field at impossible speed, and living pilots drive Moving Fortresses whose cores depend upon the Seals.',
      ],
    },
    {
      marker: 'VI',
      title: 'When a Seal Falls',
      paragraphs: [
        'Destroying a Royal Seal does not extinguish every spell at once. Stored magic fades. Wards weaken, enchanted infrastructure decays, healing and harvests fail, and political order begins to fracture unless survivors learn to live without magic.',
        'Moving Fortresses suffer a particularly cruel decline. Their wheels seize and their life-supporting cores fade, leaving wounded pilots—who cannot live outside their machines—entombed in armored hulls unless rescue comes before the last power is spent.',
      ],
    },
  ];
}
