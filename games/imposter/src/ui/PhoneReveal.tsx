// Phone reveal: the same beats as the TV, held back until 200ms after the TV's big beat.
// A teaser buzzes a heartbeat until then, then the personal result lands with its own buzz.
import { useRef } from "react";
import type { RefObject } from "react";
import type { PlayerId, PlayerSummary } from "@opg/protocol";
import type { ServerClock } from "@opg/ui";
import {
        anchorAt,
        Avatar,
        Card,
        EyesOnTv,
        Marker,
        PhoneStrip,
        reached,
        StickerBurst,
        Timer,
        useBeatEntries,
        useBuzz,
        useMoment,
} from "@opg/ui";
import { REVEAL_MS, type ImposterPlayerView } from "../state";
import {
        phoneRevealBeats,
        personalReveal,
        revealRole,
} from "./reveal-timeline";
import type { PersonalReveal } from "./reveal-timeline";

function findPlayer(
        players: PlayerSummary[],
        id: PlayerId | null,
): PlayerSummary | null {
        if (!id) return null;
        return players.find((player) => player.id === id) ?? null;
}

function nameOf(players: PlayerSummary[], id: PlayerId | null): string {
        const player = findPlayer(players, id);
        if (player) return player.name;
        return id ?? "Someone";
}

function avatarOf(players: PlayerSummary[], id: PlayerId | null) {
        return findPlayer(players, id)?.avatar ?? null;
}

function ResultCard({
        view,
        players,
        personal,
        live,
        cardRef,
}: {
        view: ImposterPlayerView;
        players: PlayerSummary[];
        personal: PersonalReveal;
        live: boolean;
        cardRef: RefObject<HTMLDivElement | null>;
}) {
        const imposter = nameOf(players, view.imposterId);
        return (
                <div ref={cardRef} style={{ flexGrow: 1, display: "flex" }}>
                        <Card
                                variant="L"
                                tilt={-1}
                                style={{
                                        flexGrow: 1,
                                        padding: "28px 22px",
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        gap: 16,
                                        textAlign: "center",
                                }}
                        >
                                {personal.celebrate ? (
                                        <div
                                                data-testid="reveal-burst"
                                                style={{
                                                        position: "absolute",
                                                        inset: 0,
                                                        zIndex: 0,
                                                }}
                                        >
                                                <StickerBurst
                                                        live={live}
                                                        count={14}
                                                        size={340}
                                                />
                                        </div>
                                ) : null}
                                <div
                                        data-testid="reveal-content"
                                        style={{
                                                position: "relative",
                                                zIndex: 1,
                                                display: "flex",
                                                flexDirection: "column",
                                                alignItems: "center",
                                                gap: 16,
                                        }}
                                >
                                        <Avatar
                                                id={avatarOf(players, view.imposterId)}
                                                size={120}
                                                alt={`${imposter}'s avatar`}
                                        />
                                        <Marker size={30}>{personal.headline}</Marker>
                                        <div style={{ fontSize: 19, fontWeight: 700 }}>
                                                {personal.sub}
                                        </div>
                                </div>
                        </Card>
                </div>
        );
}

export interface PhoneRevealProps {
        view: ImposterPlayerView;
        players: PlayerSummary[];
        me: PlayerSummary | null;
        deadline: number | null;
        timerStartedAt: number | null;
        clock: ServerClock;
}

export function PhoneReveal(props: PhoneRevealProps) {
        const { view, players, me } = props;
        const caught = view.caught === true;
        const role = revealRole(view.imposterId, me?.id ?? "", view.myVote);
        const imposter = nameOf(players, view.imposterId);
        const personal = personalReveal(caught, role, imposter);
        const beats = phoneRevealBeats(caught, personal.haptic);
        const startedAt = anchorAt(
                props.timerStartedAt,
                props.deadline,
                REVEAL_MS,
        );
        const moment = useMoment(beats, startedAt, props.clock);
        const buzz = useBuzz();
        const cardRef = useRef<HTMLDivElement>(null);
        const suspense = reached(moment, beats, "suspense");
        const personalReached = reached(moment, beats, "personal");

        useBeatEntries(beats, moment, (beat) => {
                if (beat.haptic === undefined) return;
                buzz(beat.haptic, cardRef.current);
        });

        return (
                <>
                        <PhoneStrip
                                gameName="Imposter"
                                progress="The votes are in"
                                right={
                                        <Timer
                                                deadline={props.deadline}
                                                clock={props.clock}
                                        />
                                }
                        />
                        {personalReached ? (
                                <ResultCard
                                        view={view}
                                        players={players}
                                        personal={personal}
                                        live={moment.live}
                                        cardRef={cardRef}
                                />
                        ) : (
                                <EyesOnTv
                                        title="Eyes on the TV"
                                        detail={
                                                suspense
                                                        ? "Here it comes…"
                                                        : "The votes are in…"
                                        }
                                        tempo={suspense ? "fast" : "slow"}
                                />
                        )}
                </>
        );
}
